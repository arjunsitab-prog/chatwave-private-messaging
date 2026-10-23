'use client';

import React, { useState, useEffect, useRef } from 'react';
import { createClient, User } from '@supabase/supabase-js';
import {
  Send, Image as ImageIcon, LogOut, Search, User as UserIcon, Plus, Mic, Square,
  Settings, X, Volume2, Check, Trash2, ChevronDown, Archive, VolumeX, Pin,
  Mail, Heart, Ban, Eraser, Inbox, MoreVertical, CheckSquare, Clock, ListPlus,
  Download, Link, PhoneCall, Flag
} from 'lucide-react';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

interface Message { id: string; sender_id: string; recipient_id: string; content: string; image_url?: string; audio_url?: string; created_at: string; }
interface Contact { id: string; email: string; isPinned?: boolean; isMuted?: boolean; isArchived?: boolean; isFavorite?: boolean; isUnread?: boolean; isBlocked?: boolean; }

export default function Page() {
  const [user, setUser] = useState<User | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [authError, setAuthError] = useState('');
  const [loadingSession, setLoadingSession] = useState(true);

  const [showSettings, setShowSettings] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [statusMessage, setStatusMessage] = useState('Hey there! I am using Chatbeep.');

  const [searchQuery, setSearchQuery] = useState('');
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selectedUser, setSelectedUser] = useState<Contact | null>(null);
  const [openMenuContactId, setOpenMenuContactId] = useState<string | null>(null);
  const [viewArchived, setViewArchived] = useState(false);
  const [showChatHeaderMenu, setShowChatHeaderMenu] = useState(false);

  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [uploading, setUploading] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set());

  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.title = 'Chatbeep';
    if (typeof window !== 'undefined' && 'Notification' in window) Notification.requestPermission();
  }, []);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  useEffect(() => {
    const handleClickOutside = () => { setOpenMenuContactId(null); setShowChatHeaderMenu(false); };
    window.addEventListener('click', handleClickOutside);
    return () => window.removeEventListener('click', handleClickOutside);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user?.email) setDisplayName(session.user.email.split('@')[0]);
      setLoadingSession(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
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
          setMessages((prev) => prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]);
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
    if (!e.target.files?[0] || !user || !selectedUser) return;
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
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];
      recorder.ondataavailable = (ev) => { if (ev.data.size > 0) audioChunksRef.current.push(ev.data); };
      recorder.onstop = async () => {
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const filePath = `voice/${Math.random()}.webm`;
        await supabase.storage.from('chat-attachments').upload(filePath, blob);
        const { data } = supabase.storage.from('chat-attachments').getPublicUrl(filePath);
        await supabase.from('messages').insert([{ sender_id: user?.email || user?.id, recipient_id: selectedUser?.email, content: '🎙️ Voice Note', audio_url: data.publicUrl, created_at: new Date().toISOString() }]);
        stream.getTracks().forEach((t) => t.stop());
      };
      recorder.start();
      setIsRecording(true);
    } catch { alert('Mic access denied.'); }
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
      {showSettings && (
        <div className="absolute inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
          <div className="bg-
