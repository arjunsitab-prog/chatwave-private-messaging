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

  const sortedContacts

    {/* 3. Rest of your chat sidebar and message list UI goes here... */}

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
  <img
    src={m.image_url}
    alt="chat image"
    className="max-w-xs rounded-lg cursor-pointer hover:opacity-90 transition"
    onClick={() => setPreviewImage(m.image_url!)}
  />
  <button
    onClick={() => {
      if (m.image_url) handleDownloadImage(m.image_url);
    }}
    className="absolute bottom-2 right-2 bg-black/60 text-white p-1.5 rounded-full hover:bg-black/80 transition"
    title="Download Image"
  >
    Download
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
    
  'use client';

import React, { useState } from 'react';
import { 
  X, 
  Camera, 
  Volume2, 
  Shield, 
  Folder, 
  Keyboard, 
  Sliders, 
  FolderIcon, 
  Maximize2,
  ExternalLink 
} from 'lucide-react';

export default function Settings({ 
  isOpen, 
  onClose 
}: { 
  isOpen: boolean; 
  onClose: () => void; 
}) {
  const [activeTab, setActiveTab] = useState<'devices' | 'appearance' | 'privacy' | 'files' | 'shortcuts'>('devices');

  // State options
  const [muteCamMic, setMuteCamMic] = useState(false);
  const [blurBackground, setBlurBackground] = useState(false);
  const [skipPreview, setSkipPreview] = useState(false);
  
  const [compactList, setCompactList] = useState(false);
  const [chatStyle, setChatStyle] = useState<'list' | 'bubbles'>('bubbles');
  const [playSounds, setPlaySounds] = useState(true);

  const [sendReadReceipts, setSendReadReceipts] = useState(true);
  const [shareTyping, setShareTyping] = useState(true);

  if (!isOpen) return null;

  const scrollToSection = (id: string) => {
    setActiveTab(id as any);
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="flex h-[85vh] w-full max-w-4xl rounded-xl bg-[#0f172a] text-gray-200 border border-gray-800 shadow-2xl overflow-hidden">
        
        {/* Left Sidebar */}
        <div className="w-64 border-r border-gray-800 bg-[#0b1329] p-4 flex flex-col justify-between">
          <div>
            <h2 className="text-xl font-bold text-white px-3 mb-6">App settings</h2>
            <nav className="space-y-1">
              {[
                { id: 'devices', label: 'Devices' },
                { id: 'appearance', label: 'Appearance & Sounds' },
                { id: 'privacy', label: 'Privacy' },
                { id: 'files', label: 'Files' },
                { id: 'shortcuts', label: 'Keyboard shortcuts' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => scrollToSection(tab.id)}
                  className={`w-full text-left px-3 py-2.5 rounded-lg text-sm font-medium transition ${
                    activeTab === tab.id
                      ? 'bg-blue-600/20 text-blue-400 font-semibold'
                      : 'text-gray-400 hover:bg-gray-800/50 hover:text-white'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </nav>
          </div>
          <div className="px-3 text-xs text-gray-500">talk 24.0.2</div>
        </div>

        {/* Right Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar">
          
          {/* Header Close Button */}
          <div className="flex justify-end sticky top-0 bg-[#0f172a]/90 backdrop-blur pb-2 z-10">
            <button 
              onClick={onClose}
              className="text-gray-400 hover:text-white p-1 rounded-lg hover:bg-gray-800 transition"
            >
              <X size={20} />
            </button>
          </div>

          {/* Section: Devices */}
          <section id="devices" className="space-y-4">
            <h3 className="text-lg font-bold text-white">Devices</h3>
            <div className="space-y-2">
              <ToggleRow
                label="Turn camera and microphone off by default"
                checked={muteCamMic}
                onChange={setMuteCamMic}
              />
              <ToggleRow
                label="Blur camera background by default"
                checked={blurBackground}
                onChange={setBlurBackground}
              />
              <ToggleRow
                label="Skip device preview before joining a call"
                description="Camera will be turned off when joining. Always shown if recording consent is required."
                checked={skipPreview}
                onChange={setSkipPreview}
              />
            </div>

            <div className="flex items-center justify-between p-3.5 bg-[#182238] rounded-xl border border-gray-800">
              <span className="text-sm font-medium text-gray-200">Microphone settings</span>
              <Sliders size={18} className="text-gray-400 cursor-pointer hover:text-white" />
            </div>

            <button className="w-full flex items-center justify-center gap-2 py-2.5 bg-[#182238] hover:bg-[#1f2d4a] border border-gray-700/60 rounded-xl text-sm font-medium text-gray-200 transition">
              <Camera size={16} /> Check devices
            </button>
          </section>

          {/* Section: Appearance & Sounds */}
          <section id="appearance" className="space-y-4 pt-4 border-t border-gray-800/60">
            <h3 className="text-lg font-bold text-white">Appearance & Sounds</h3>
            <ToggleRow
              label="Compact conversations list"
              checked={compactList}
              onChange={setCompactList}
            />

            <div>
              <p className="text-sm font-medium text-gray-300 mb-3">Chat appearance</p>
              
              {/* Preview Box */}
              <div className="p-4 bg-[#0a0f1d] border border-gray-800 rounded-xl mb-3 space-y-3">
                <div className="flex gap-2 items-start">
                  <div className="w-7 h-7 rounded-full bg-gray-700 flex items-center justify-center text-xs text-gray-300 font-bold">A</div>
                  <div className="bg-[#1e293b] text-xs p-2.5 rounded-lg text-gray-200 max-w-xs">
                    Hey! Are you using the list style or message bubbles?
                    <div className="text-[10px] text-gray-400 text-right mt-1">6:13 PM</div>
                  </div>
                </div>
                <div className="flex justify-end">
                  <div className="bg-blue-600/80 text-xs p-2.5 rounded-lg text-white max-w-xs">
                    I picked message bubbles
                    <div className="text-[10px] text-blue-200 text-right mt-1">6:13 PM ✓</div>
                  </div>
                </div>
              </div>

              {/* Selector */}
              <div className="grid grid-cols-2 p-1 bg-[#182238] rounded-xl border border-gray-800">
                <button
                  onClick={() => setChatStyle('list')}
                  className={`py-2 text-xs font-semibold rounded-lg transition ${
                    chatStyle === 'list' ? 'bg-blue-600 text-white shadow' : 'text-gray-400 hover:text-white'
                  }`}
                >
                  Messages list
                </button>
                <button
                  onClick={() => setChatStyle('bubbles')}
                  className={`py-2 text-xs font-semibold rounded-lg transition ${
                    chatStyle === 'bubbles' ? 'bg-blue-600 text-white shadow' : 'text-gray-400 hover:text-white'
                  }`}
                >
                  Message bubbles
                </button>
              </div>
            </div>

            <ToggleRow
              label="Play sounds when participants join or leave a call"
              description="Currently not available on iPhone and iPad due to technical restrictions by the manufacturer"
              checked={playSounds}
              onChange={setPlaySounds}
            />

            <div className="flex items-center justify-between p-3.5 bg-[#182238] rounded-xl border border-gray-800">
              <div>
                <p className="text-sm font-medium text-gray-200">Notification settings</p>
                <p className="text-xs text-gray-400">Sounds for chat and call notifications</p>
              </div>
              <ExternalLink size={16} className="text-gray-400 cursor-pointer hover:text-white" />
            </div>
          </section>

          {/* Section: Privacy */}
          <section id="privacy" className="space-y-4 pt-4 border-t border-gray-800/60">
            <h3 className="text-lg font-bold text-white">Privacy</h3>
            <ToggleRow
              label="Send read receipts"
              description="When off, all read statuses will be hidden"
              checked={sendReadReceipts}
              onChange={setSendReadReceipts}
            />
            <ToggleRow
              label="Share typing status"
              description="When off, all typing indicators will be hidden"
              checked={shareTyping}
              onChange={setShareTyping}
            />
          </section>

          {/* Section: Files */}
          <section id="files" className="space-y-4 pt-4 border-t border-gray-800/60">
            <h3 className="text-lg font-bold text-white">Files</h3>
            <div className="flex items-center justify-between p-3.5 bg-[#182238] rounded-xl border border-gray-800">
              <div>
                <p className="text-xs text-gray-400">Attachments folder</p>
                <p className="text-sm font-medium text-gray-200">/Talk</p>
              </div>
              <FolderIcon size={18} className="text-gray-400 cursor-pointer hover:text-white" />
            </div>
          </section>

          {/* Section: Keyboard Shortcuts */}
          <section id="shortcuts" className="space-y-3 pt-4 border-t border-gray-800/60">
            <h3 className="text-lg font-bold text-white">Keyboard shortcuts</h3>
            
            <ShortcutRow label="Toggle full screen" keyCombo="F" />
            <ShortcutRow label="Return to Home screen" keyCombo="Escape" />
            <ShortcutRow label="Search" keyCombo="Ctrl + F" />

            <h4 className="text-xs font-semibold text-gray-400 pt-2 uppercase tracking-wider">Shortcuts while in a chat</h4>
            <ShortcutRow label="Focus the chat input" keyCombo="C" />
            <ShortcutRow label="Unfocus the chat input to use shortcuts" keyCombo="Escape" />
            <ShortcutRow label="Edit your last message" keyCombo="Ctrl + ↑" />

            <h4 className="text-xs font-semibold text-gray-400 pt-2 uppercase tracking-wider">Shortcuts while in a call</h4>
            <ShortcutRow label="Camera on and off" keyCombo="V" />
            <ShortcutRow label="Microphone on and off" keyCombo="M" />
            <ShortcutRow label="Raise or lower hand" keyCombo="R" />
            <ShortcutRow label="Push to talk or push to mute" keyCombo="Space" />
            <ShortcutRow label="Zoom-in / zoom-out a screen share" keyCombo="Mouse wheel" />
          </section>

        </div>
      </div>
    </div>
  );
}

// Reusable Toggle Row Component
function ToggleRow({ 
  label, 
  description, 
  checked, 
  onChange 
}: { 
  label: string; 
  description?: string; 
  checked: boolean; 
  onChange: (val: boolean) => void; 
}) {
  return (
    <div className="flex items-center justify-between p-3.5 bg-[#182238] rounded-xl border border-gray-800/80">
      <div className="pr-4">
        <p className="text-sm font-medium text-gray-200">{label}</p>
        {description && <p className="text-xs text-gray-400 mt-0.5">{description}</p>}
      </div>
      <button
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full transition-colors duration-200 ease-in-out ${
          checked ? 'bg-blue-600' : 'bg-gray-700'
        }`}
      >
        <span
          className={`inline-block h-5 w-5 transform rounded-full bg-white transition duration-200 ease-in-out mt-0.5 ml-0.5 ${
            checked ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  );
}

// Reusable Keyboard Shortcut Row Component
function ShortcutRow({ label, keyCombo }: { label: string; keyCombo: string }) {
  const keys = keyCombo.split(' + ');

  return (
    <div className="flex items-center justify-between py-2 border-b border-gray-800/40 text-sm">
      <span className="text-gray-300">{label}</span>
      <div className="flex gap-1">
        {keys.map((k, idx) => (
          <kbd
            key={idx}
            className="px-2 py-1 text-xs font-semibold text-gray-300 bg-[#1e293b] border border-gray-700 rounded-md shadow-sm"
          >
            {k}
          </kbd>
        ))}
      </div>
    </div>
  );
}
