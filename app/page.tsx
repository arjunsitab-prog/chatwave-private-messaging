'use client';
import React, { useState, useEffect, useRef } from 'react';
import { createClient, User } from '@supabase/supabase-js';
import { Send, Image as ImageIcon, LogOut, Search, User as UserIcon, Plus, Mic, Square, Settings, X, Play, Pause, Check, Trash2, ChevronDown, Archive, VolumeX, Pin, Heart, Ban, Eraser, MoreVertical } from 'lucide-react';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || '', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '');

interface Message { id: string; sender_id: string; recipient_id: string; content: string; image_url?: string; audio_url?: string; created_at: string; }
interface Contact { id: string; email: string; isPinned?: boolean; isMuted?: boolean; isArchived?: boolean; isFavorite?: boolean; isBlocked?: boolean; }

function VoiceMessagePlayer({ audioUrl }: { audioUrl: string }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) { audioRef.current.pause(); setIsPlaying(false); }
    else { audioRef.current.play(); setIsPlaying(true); }
  };

  const formatTime = (t: number) => `${Math.floor(t / 60)}:${Math.floor(t % 60) < 10 ? '0' : ''}${Math.floor(t % 60)}`;

  return (
    <div className="flex items-center space-x-3 my-1 bg-black/30 p-2.5 rounded-lg w-64 border border-white/10">
      <audio ref={audioRef} src={audioUrl} onTimeUpdate={() => audioRef.current && setCurrentTime(audioRef.current.currentTime)} onLoadedMetadata={() => audioRef.current && setDuration(audioRef.current.duration)} onEnded={() => { setIsPlaying(false); setCurrentTime(0); }} preload="metadata" />
      <button type="button" onClick={togglePlay} className="w-8 h-8 rounded-full bg-blue-500 text-white flex items-center justify-center shrink-0">
        {isPlaying ? <Pause className="w-4 h-4 fill-white" /> : <Play className="w-4 h-4 fill-white ml-0.5" />}
      </button>
      <div className="flex-1 flex flex-col">
        <div className="h-1.5 w-full bg-zinc-700 rounded-full overflow-hidden">
          <div className="h-full bg-blue-400" style={{ width: `${duration ? (currentTime / duration) * 100 : 0}%` }} />
        </div>
        <div className="flex justify-between text-[10px] text-gray-300 mt-1 font-mono">
          <span>{formatTime(currentTime)}</span><span>{formatTime(duration || 0)}</span>
        </div>
      </div>
    </div>
  );
}

export default function Page() {
  const [user, setUser] = useState<User | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [authError, setAuthError] = useState('');
  const [loadingSession, setLoadingSession] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [statusMessage, setStatusMessage] = useState('Using Chatbeep.');
  const [searchQuery, setSearchQuery] = useState('');
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selectedUser, setSelectedUser] = useState<Contact | null>(null);
  const [openMenuContactId, setOpenMenuContactId] = useState<string | null>(null);
  const [viewArchived, setViewArchived] = useState(false);
  const [showChatHeaderMenu, setShowChatHeaderMenu] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const handleDownloadImage = (imageUrl: string, filename = 'chatbeep-image.jpg') => {
    const link = document.createElement('a');
    link.href = imageUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settings, setSettings] = useState({
    soundEnabled: true,
    darkMode: true,
    autoSaveImages: false,
  });
  const [newMessage, setNewMessage] = useState('');
  const [uploading, setUploading] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set());
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => { document.title = 'Chatbeep'; }, []);
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);
  useEffect(() => {
    const handleOutside = () => { setOpenMenuContactId(null); setShowChatHeaderMenu(false); };
    window.addEventListener('click', handleOutside);
    return () => window.removeEventListener('click', handleOutside);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user?.email) setDisplayName(session.user.email.split('@')[0]);
      setLoadingSession(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      setUser(session?.user ?? null);
      if (session?.user?.email) setDisplayName(session.user.email.split('@')[0]);
      setLoadingSession(false);
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;
    const myId = user.email || user.id;
    supabase.from('messages').select('sender_id, recipient_id').or(`sender_id.eq.${myId},recipient_id.eq.${myId}`).then(({ data }) => {
      if (data) {
        const contactSet = new Set<string>();
        data.forEach((m) => {
          if (m.sender_id && m.sender_id !== myId) contactSet.add(m.sender_id);
          if (m.recipient_id && m.recipient_id !== myId) contactSet.add(m.recipient_id);
        });
        setContacts(Array.from(contactSet).map((e) => ({ id: e, email: e })));
      }
    });
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const room = supabase.channel('online-users', { config: { presence: { key: user.email || user.id } } });
    room.on('presence', { event: 'sync' }, () => setOnlineUsers(new Set(Object.keys(room.presenceState()))))
      .subscribe(async (status) => { if (status === 'SUBSCRIBED') await room.track({ online_at: new Date().toISOString() }); });
    return () => { supabase.removeChannel(room); };
  }, [user]);

  useEffect(() => {
    if (!user || !selectedUser) return;
    const myId = user.email || user.id;
    const otherId = selectedUser.email;
    supabase.from('messages').select('*').or(`sender_id.eq.${myId},recipient_id.eq.${myId}`).order('created_at', { ascending: true }).then(({ data }) => {
      if (data) setMessages(data.filter((m) => (m.sender_id === myId && m.recipient_id === otherId) || (m.sender_id === otherId && m.recipient_id === myId)));
    });
    const channel = supabase.channel(`public:messages:${myId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
        const msg = payload.new as Message;
        if ((msg.sender_id === myId && msg.recipient_id === otherId) || (msg.sender_id === otherId && msg.recipient_id === myId)) {
          setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
        }
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'messages' }, (payload) => {
        setMessages((prev) => prev.filter((m) => m.id !== payload.old.id));
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, selectedUser]);

  const handleAddContact = () => {
    if (!searchQuery.trim()) return;
    const newContact = { id: searchQuery.trim(), email: searchQuery.trim() };
    if (!contacts.some((c) => c.email.toLowerCase() === newContact.email.toLowerCase())) setContacts((prev) => [...prev, newContact]);
    setSelectedUser(newContact);
    setSearchQuery('');
  };

  const toggleContactProperty = (email: string, prop: keyof Contact) => {
    setContacts((prev) => prev.map((c) => (c.email === email ? { ...c, [prop]: !c[prop] } : c)));
  };

  const handleClearChat = async (targetEmail: string) => {
    if (!user) return;
    const myId = user.email || user.id;
    setMessages([]);
    await supabase.from('messages').delete().or(`and(sender_id.eq.${myId},recipient_id.eq.${targetEmail}),and(sender_id.eq.${targetEmail},recipient_id.eq.${myId})`);
  };

  const handleDeleteChat = async (targetEmail: string) => {
    await handleClearChat(targetEmail);
    setContacts((prev) => prev.filter((c) => c.email !== targetEmail));
    if (selectedUser?.email === targetEmail) setSelectedUser(null);
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    if (authMode === 'login') {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setAuthError(error.message);
    } else {
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) setAuthError(error.message);
      else alert('Account created! Sign in now.');
    }
  };

  const handleDeleteMessage = async (messageId: string) => {
    setMessages((prev) => prev.filter((m) => m.id !== messageId));
    await supabase.from('messages').delete().eq('id', messageId);
  };

  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!newMessage.trim() || !user || !selectedUser || selectedUser.isBlocked) return;
    const msg = { sender_id: user.email || user.id, recipient_id: selectedUser.email, content: newMessage, created_at: new Date().toISOString() };
    const tempId = Math.random().toString();
    setMessages((prev) => [...prev, { ...msg, id: tempId }]);
    setNewMessage('');
    const { data } = await supabase.from('messages').insert([msg]).select();
    if (data && data[0]) {
      setMessages((prev) => prev.map((m) => (m.id === tempId ? data[0] : m)));
      if (!contacts.some((c) => c.email === selectedUser.email)) setContacts((prev) => [...prev, selectedUser]);
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.[0] || !user || !selectedUser) return;
    setUploading(true);
    const file = e.target.files[0];
    const filePath = `images/${Math.random()}.${file.name.split('.').pop()}`;
    await supabase.storage.from('chat-attachments').upload(filePath, file);
    const { data } = supabase.storage.from('chat-attachments').getPublicUrl(filePath);
    await supabase.from('messages').insert([{ sender_id: user.email || user.id, recipient_id: selectedUser.email, content: '📷 Image', image_url: data.publicUrl, created_at: new Date().toISOString() }]);
    setUploading(false);
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];
      recorder.ondataavailable = (ev) => { if (ev.data.size > 0) audioChunksRef.current.push(ev.data); };
      recorder.onstop = async () => {
        setIsRecording(false);
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const filePath = `voice/${Math.random()}.webm`;
        await supabase.storage.from('chat-attachments').upload(filePath, blob);
        const { data } = supabase.storage.from('chat-attachments').getPublicUrl(filePath);
        if (user && selectedUser) {
          await supabase.from('messages').insert([{ sender_id: user.email || user.id, recipient_id: selectedUser.email, content: '🎙️ Voice Note', audio_url: data.publicUrl, created_at: new Date().toISOString() }]);
        }
        if (mediaStreamRef.current) {
          mediaStreamRef.current.getTracks().forEach((track) => track.stop());
          mediaStreamRef.current = null;
        }
      };
      recorder.start();
      setIsRecording(true);
    } catch { alert('Mic access denied.'); }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') mediaRecorderRef.current.stop();
  };

  if (loadingSession) return <div className="flex items-center justify-center min-h-screen bg-black text-white">Loading...</div>;

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-black text-white p-4">
        <div className="w-full max-w-md bg-zinc-950 p-6 rounded-xl border border-blue-900/50">
          <h1 className="text-2xl font-bold text-blue-400 mb-4">Chatbeep</h1>
          <form onSubmit={handleAuth} className="space-y-4">
            <input type="email" required placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full bg-zinc-900 border border-zinc-800 rounded px-3 py-2 text-sm text-white" />
            <input type="password" required placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full bg-zinc-900 border border-zinc-800 rounded px-3 py-2 text-sm text-white" />
            {authError && <p className="text-red-400 text-xs">{authError}</p>}
            <button type="submit" className="w-full bg-blue-600 py-2 rounded text-white font-semibold">{authMode === 'login' ? 'Sign In' : 'Sign Up'}</button>
          </form>
          <button onClick={() => setAuthMode(authMode === 'login' ? 'signup' : 'login')} className="mt-4 text-xs text-blue-400">{authMode === 'login' ? 'Create account' : 'Have an account? Sign in'}</button>
        </div>
      </div>
    );
  }

  const archivedCount = contacts.filter((c) => c.isArchived).length;
  const sortedContacts = contacts.filter((c) => (viewArchived ? c.isArchived : !c.isArchived)).filter((c) => c.email.toLowerCase().includes(searchQuery.toLowerCase())).sort((a, b) => (b.isPinned ? 1 : 0) - (a.isPinned ? 1 : 0));

  return (
    <div className="flex h-screen bg-black text-white overflow-hidden relative">
      {previewImage && (
        <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4">
          <button onClick={() => setPreviewImage(null)} className="absolute top-4 right-4 p-2 bg-zinc-800 text-white rounded-full"><X className="w-6 h-6" /></button>
          <img src={previewImage} alt="Expanded View" className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl" />
        </div>
      )}

      {showSettings && (
        <div className="absolute inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
          <div className="bg-zinc-950 border border-blue-900/50 rounded-xl p-6 w-full max-w-md relative">
            <button onClick={() => setShowSettings(false)} className="absolute top-4 right-4 text-gray-400"><X className="w-5 h-5" /></button>
            <h2 className="text-xl font-bold text-blue-400 mb-4">Settings</h2>
            <input type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)} className="w-full bg-zinc-900 border border-zinc-800 rounded p-2 text-sm text-white mb-3" placeholder="Display Name" />
            <input type="text" value={statusMessage} onChange={(e) => setStatusMessage(e.target.value)} className="w-full bg-zinc-900 border border-zinc-800 rounded p-2 text-sm text-white" placeholder="Status" />
          </div>
        </div>
      )}

      <div className="w-80 border-r border-blue-900/40 bg-zinc-950 flex flex-col">
        <div className="p-4 border-b border-blue-900/40 flex items-center justify-between">
          <span className="font-bold text-blue-400">Chatbeep</span>
          <div className="flex space-x-1">
            <button onClick={() => setShowSettings(true)} className="p-2 text-gray-400 hover:text-blue-400"><Settings className="w-5 h-5" /></button>
            <button onClick={() => supabase.auth.signOut()} className="p-2 text-gray-400 hover:text-red-400"><LogOut className="w-5 h-5" /></button>
          </div>
        </div>

        <div className="p-3 border-b border-zinc-900 flex space-x-2">
          <input type="text" placeholder="Search email..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleAddContact()} className="w-full bg-zinc-900 text-xs rounded px-3 py-2 border border-zinc-800 text-white" />
          {searchQuery.trim() && <button onClick={handleAddContact} className="bg-blue-600 px-3 rounded"><Plus className="w-4 h-4" /></button>}
        </div>

        <div className="p-2 border-b border-zinc-900 flex justify-between">
          <button onClick={() => setViewArchived(false)} className={`flex-1 py-1 rounded text-xs font-semibold ${!viewArchived ? 'bg-blue-600 text-white' : 'text-gray-400'}`}>Chats</button>
          <button onClick={() => setViewArchived(true)} className={`flex-1 py-1 rounded text-xs font-semibold ${viewArchived ? 'bg-blue-600 text-white' : 'text-gray-400'}`}>Archived ({archivedCount})</button>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {sortedContacts.map((c) => (
            <div key={c.email} className="relative group">
              <button onClick={() => setSelectedUser(c)} className={`w-full flex items-center justify-between p-2 rounded-xl text-left ${selectedUser?.email === c.email ? 'bg-blue-600/20 border border-blue-500/40' : 'hover:bg-zinc-900'}`}>
                <div className="truncate flex items-center space-x-2">
                  <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center text-xs text-blue-400 font-bold">{c.email[0].toUpperCase()}</div>
                  <span className="text-xs truncate">{c.email}</span>
                </div>
                <button onClick={(e) => { e.stopPropagation(); setOpenMenuContactId(openMenuContactId === c.email ? null : c.email); }} className="opacity-0 group-hover:opacity-100 p-1"><ChevronDown className="w-4 h-4" /></button>
              </button>
              {openMenuContactId === c.email && (
                <div onClick={(e) => e.stopPropagation()} className="absolute right-2 top-10 w-44 bg-zinc-900 border border-zinc-800 rounded shadow-xl z-50 py-1 text-xs">
                  <button onClick={() => { toggleContactProperty(c.email, 'isArchived'); setOpenMenuContactId(null); }} className="w-full px-3 py-2 text-left hover:bg-zinc-800">{c.isArchived ? 'Unarchive' : 'Archive'}</button>
                  <button onClick={() => { toggleContactProperty(c.email, 'isPinned'); setOpenMenuContactId(null); }} className="w-full px-3 py-2 text-left hover:bg-zinc-800">{c.isPinned ? 'Unpin' : 'Pin'}</button>
                  <button onClick={() => { handleDeleteChat(c.email); setOpenMenuContactId(null); }} className="w-full px-3 py-2 text-left text-red-400 hover:bg-zinc-800">Delete</button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="flex-1 flex flex-col bg-black overflow-hidden">
        {selectedUser ? (
          <>
            <div className="p-4 border-b border-blue-900/40 flex items-center justify-between bg-zinc-950 relative">
              <span className="font-semibold text-blue-400">{selectedUser.email}</span>
              <div className="relative">
                <button onClick={(e) => { e.stopPropagation(); setShowChatHeaderMenu(!showChatHeaderMenu); }} className="p-2 text-gray-400 hover:text-white"><MoreVertical className="w-5 h-5" /></button>
                {showChatHeaderMenu && (
                  <div onClick={(e) => e.stopPropagation()} className="absolute right-0 top-10 w-48 bg-zinc-900 border border-zinc-800 rounded shadow-xl z-50 py-1 text-xs">
                    <button onClick={() => { toggleContactProperty(selectedUser.email, 'isMuted'); setShowChatHeaderMenu(false); }} className="w-full px-4 py-2 text-left hover:bg-zinc-800">Mute notifications</button>
                    <button onClick={() => { handleDeleteChat(selectedUser.email); setShowChatHeaderMenu(false); }} className="w-full px-4 py-2 text-left text-red-400 hover:bg-zinc-800">Delete chat</button>
                  </div>
                )}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {messages.map((m) => {
                const isMe = m.sender_id === user.email || m.sender_id === user.id;
                return (
                  <div key={m.id} className={`flex flex-col group ${isMe ? 'items-end' : 'items-start'}`}>
                    <div className="flex items-center space-x-2">
                      {isMe && <button onClick={() => handleDeleteMessage(m.id)} className="opacity-0 group-hover:opacity-100 text-gray-500 hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>}
                      <div className={`p-3 rounded-xl max-w-md text-sm ${isMe ? 'bg-blue-600 text-white rounded-br-none' : 'bg-zinc-900 border border-zinc-800 text-gray-200 rounded-bl-none'}`}>
                        {m.image_url && (
  <div className="relative mt-2">
    <img src={m.image_url} alt="chat image" className="max-w-xs rounded-lg" />
    <button 
onClick={() => {
  if (m.image_url) handleDownloadImage(m.image_url);
}}    >
      📥 Download
    </button>
  </div>
)}
                        {m.audio_url && <VoiceMessagePlayer audioUrl={m.audio_url} />}
                        <p>{m.content}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            <form onSubmit={handleSendMessage} className="p-3 border-t border-blue-900/40 flex items-center space-x-2 bg-zinc-950">
              <input type="file" ref={fileInputRef} onChange={handleImageUpload} className="hidden" accept="image/*" />
              <button type="button" onClick={() => fileInputRef.current?.click()} className="text-blue-400 p-2"><ImageIcon className="w-5 h-5" /></button>
              {isRecording ? (
                <button type="button" onClick={stopRecording} className="bg-red-600 p-2 rounded text-white text-xs animate-pulse">Stop Recording</button>
              ) : (
                <button type="button" onClick={startRecording} className="text-blue-400 p-2"><Mic className="w-5 h-5" /></button>
              )}
              <input type="text" value={newMessage} onChange={(e) => setNewMessage(e.target.value)} placeholder="Type a message..." className="flex-1 bg-zinc-900 text-white px-3 py-2 rounded text-sm border border-zinc-800 focus:outline-none" />
              <button type="submit" className="bg-blue-600 p-2 rounded text-white"><Send className="w-5 h-5" /></button>
            </form>
          </>
        ) : (
          <div className="flex items-center justify-center h-full text-gray-500 text-sm">Select a chat to start messaging</div>
        )}
      </div>
    
  {/* Settings Modal */}
      {isSettingsOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-gray-800 text-white rounded-lg p-6 w-full max-w-md shadow-xl">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold">Settings</h2>
              <button 
                onClick={() => setIsSettingsOpen(false)}
                className="text-gray-400 hover:text-white text-lg font-bold"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span>Notification Sounds</span>
                <input 
                  type="checkbox" 
                  checked={settings.soundEnabled}
                  onChange={(e) => setSettings({ ...settings, soundEnabled: e.target.checked })}
                  className="w-5 h-5 accent-blue-600"
                />
              </div>

              <div className="flex items-center justify-between">
                <span>Dark Mode</span>
                <input 
                  type="checkbox" 
                  checked={settings.darkMode}
                  onChange={(e) => setSettings({ ...settings, darkMode: e.target.checked })}
                  className="w-5 h-5 accent-blue-600"
                />
              </div>

              <div className="flex items-center justify-between">
                <span>Auto-Save Received Images</span>
                <input 
                  type="checkbox" 
                  checked={settings.autoSaveImages}
                  onChange={(e) => setSettings({ ...settings, autoSaveImages: e.target.checked })}
                  className="w-5 h-5 accent-blue-600"
                />
              </div>
            </div>

            <button 
              onClick={() => setIsSettingsOpen(false)}
              className="mt-6 w-full py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg"
            >
              Save Settings
            </button>
          </div>
        </div>
      )}
      </div>
  );
}
