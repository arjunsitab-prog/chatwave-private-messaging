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

interface Message {
  id: string;
  sender_id: string;
  recipient_id: string;
  content: string;
  image_url?: string;
  audio_url?: string;
  created_at: string;
}

interface Contact {
  id: string;
  email: string;
  isPinned?: boolean;
  isMuted?: boolean;
  isArchived?: boolean;
  isFavorite?: boolean;
  isUnread?: boolean;
  isBlocked?: boolean;
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
    if (typeof window !== 'undefined' && 'Notification' in window) {
      Notification.requestPermission();
    }
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    const handleClickOutside = () => {
      setOpenMenuContactId(null);
      setShowChatHeaderMenu(false);
    };
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

    const fetchSavedContacts = async () => {
      const { data, error } = await supabase
        .from('messages')
        .select('sender_id, recipient_id')
        .or(`sender_id.eq.${myId},recipient_id.eq.${myId}`);

      if (!error && data) {
        const contactSet = new Set<string>();
        data.forEach((msg) => {
          if (msg.sender_id && msg.sender_id !== myId) contactSet.add(msg.sender_id);
          if (msg.recipient_id && msg.recipient_id !== myId) contactSet.add(msg.recipient_id);
        });

        setContacts(Array.from(contactSet).map((e) => ({ id: e, email: e })));
      }
    };

    fetchSavedContacts();
  }, [user]);

  useEffect(() => {
    if (!user) return;

    const room = supabase.channel('online-users', {
      config: { presence: { key: user.email || user.id } },
    });

    room
      .on('presence', { event: 'sync' }, () => {
        const state = room.presenceState();
        setOnlineUsers(new Set(Object.keys(state)));
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') await room.track({ online_at: new Date().toISOString() });
      });

    return () => { supabase.removeChannel(room); };
  }, [user]);

  const notifyUser = (sender: string, text: string) => {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(587.33, audioCtx.currentTime);
      gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);
      oscillator.start();
      oscillator.stop(audioCtx.currentTime + 0.15);
    } catch (e) {}

    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
      new Notification(`New message from ${sender}`, { body: text, icon: '/favicon.ico' });
    }
  };

  useEffect(() => {
    if (!user || !selectedUser) return;

    const myId = user.email || user.id;
    const otherId = selectedUser.email;

    const fetchMessages = async () => {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .or(`sender_id.eq.${myId},recipient_id.eq.${myId}`)
        .order('created_at', { ascending: true });

      if (!error && data) {
        setMessages(data.filter(
          (m) => (m.sender_id === myId && m.recipient_id === otherId) || (m.sender_id === otherId && m.recipient_id === myId)
        ));
      }
    };

    fetchMessages();

    const messageChannel = supabase
      .channel(`public:messages:${myId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
        const newMsg = payload.new as Message;
        const isRelevant = (newMsg.sender_id === myId && newMsg.recipient_id === otherId) || (newMsg.sender_id === otherId && newMsg.recipient_id === myId);

        if (isRelevant) {
          setMessages((prev) => prev.some((m) => m.id === newMsg.id) ? prev : [...prev, newMsg]);
          if (newMsg.sender_id === otherId && !selectedUser.isMuted) notifyUser(otherId, newMsg.content);
        }
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'messages' }, (payload) => {
        setMessages((prev) => prev.filter((m) => m.id !== payload.old.id));
      })
      .subscribe();

    return () => { supabase.removeChannel(messageChannel); };
  }, [user, selectedUser]);

  const handleAddContact = () => {
    if (!searchQuery.trim()) return;
    const newContact: Contact = { id: searchQuery.trim(), email: searchQuery.trim() };
    if (!contacts.some((c) => c.email.toLowerCase() === newContact.email.toLowerCase())) {
      setContacts((prev) => [...prev, newContact]);
    }
    setSelectedUser(newContact);
    setSearchQuery('');
  };

  const toggleContactProperty = (email: string, property: keyof Contact) => {
    setContacts((prev) => prev.map((c) => (c.email === email ? { ...c, [property]: !c[property] } : c)));
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
      else alert('Account created! You can now sign in.');
    }
  };

  const handleDeleteMessage = async (messageId: string) => {
    setMessages((prev) => prev.filter((m) => m.id !== messageId));
    await supabase.from('messages').delete().eq('id', messageId);
  };

  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!newMessage.trim() || !user || !selectedUser || selectedUser.isBlocked) return;

    const msg = {
      sender_id: user.email || user.id,
      recipient_id: selectedUser.email,
      content: newMessage,
      created_at: new Date().toISOString(),
    };

    const tempId = Math.random().toString();
    setMessages((prev) => [...prev, { ...msg, id: tempId }]);
    setNewMessage('');

    const { data, error } = await supabase.from('messages').insert([msg]).select();
    if (!error && data && data[0]) {
      setMessages((prev) => prev.map((m) => (m.id === tempId ? data[0] : m)));
      if (!contacts.some((c) => c.email === selectedUser.email)) setContacts((prev) => [...prev, selectedUser]);
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0 || !user || !selectedUser) return;
    try {
      setUploading(true);
      const file = e.target.files[0];
      const filePath = `images/${Math.random()}.${file.name.split('.').pop()}`;

      const { error: uploadError } = await supabase.storage.from('chat-attachments').upload(filePath, file);
      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from('chat-attachments').getPublicUrl(filePath);
      await supabase.from('messages').insert([{
        sender_id: user.email || user.id,
        recipient_id: selectedUser.email,
        content: '📷 Image Attachment',
        image_url: data.publicUrl,
        created_at: new Date().toISOString(),
      }]);
    } catch (err: any) {
      console.error(err);
    } finally {
      setUploading(false);
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => { if (event.data.size > 0) audioChunksRef.current.push(event.data); };
      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        await uploadAudioMessage(audioBlob);
        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      alert('Microphone permission required.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const uploadAudioMessage = async (audioBlob: Blob) => {
    if (!user || !selectedUser) return;
    try {
      setUploading(true);
      const filePath = `voice-notes/${Math.random()}.webm`;
      const { error: uploadError } = await supabase.storage.from('chat-attachments').upload(filePath, audioBlob);
      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from('chat-attachments').getPublicUrl(filePath);
      await supabase.from('messages').insert([{
        sender_id: user.email || user.id,
        recipient_id: selectedUser.email,
        content: '🎙️ Voice Note',
        audio_url: data.publicUrl,
        created_at: new Date().toISOString(),
      }]);
    } catch (err: any) {
      console.error(err);
    } finally {
      setUploading(false);
    }
  };

  if (loadingSession) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-black text-white">
        <p className="text-sm text-blue-400 animate-pulse">Loading Chatbeep...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen min-h-[100dvh] bg-black text-white p-4">
        <div className="w-full max-w-md bg-zinc-950 p-6 rounded-xl border border-blue-900/50 shadow-2xl">
          <div className="flex items-center space-x-3 mb-6">
            <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center font-bold text-lg text-white">CB</div>
            <div>
              <h1 className="text-2xl font-bold text-blue-400">Chatbeep</h1>
              <p className="text-xs text-gray-400">Messaging Platform</p>
            </div>
          </div>
          <form onSubmit={handleAuth} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-gray-400 mb-1">Email</label>
              <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500 text-sm" placeholder="you@example.com" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-400 mb-1">Password</label>
              <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500 text-sm" placeholder="••••••••" />
            </div>
            {authError && <p className="text-red-400 text-xs">{authError}</p>}
            <button type="submit" className="w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold py-2 rounded-lg transition">
              {authMode === 'login' ? 'Sign In' : 'Create Account'}
            </button>
          </form>
          <div className="mt-4 text-center">
            <button onClick={() => setAuthMode(authMode === 'login' ? 'signup' : 'login')} className="text-xs text-blue-400 hover:underline">
              {authMode === 'login' ? "Don't have an account? Sign Up" : 'Already have an account? Sign In'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  const archivedCount = contacts.filter((c) => c.isArchived).length;
  const sortedContacts = [...contacts]
    .filter((c) => (viewArchived ? c.isArchived : !c.isArchived))
    .filter((c) => c.email.toLowerCase().includes(searchQuery.toLowerCase()))
    .sort((a, b) => (b.isPinned ? 1 : 0) - (a.isPinned ? 1 : 0));

  return (
    <div className="flex h-screen h-[100dvh] bg-black text-white overflow-hidden relative">
      {showSettings && (
        <div className="absolute inset-0 bg-black/80 backdrop-blur-
