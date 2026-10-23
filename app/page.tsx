'use client';

import React, { useState, useEffect, useRef } from 'react';
import { createClient, User } from '@supabase/supabase-js';
import {
  Send,
  Image as ImageIcon,
  LogOut,
  Search,
  User as UserIcon,
  Plus,
  Mic,
  Square,
  Settings,
  X,
  Volume2
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
}

export default function Page() {
  const [user, setUser] = useState<User | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [authError, setAuthError] = useState('');

  // Profile & Settings State
  const [showSettings, setShowSettings] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [statusMessage, setStatusMessage] = useState('Hey there! I am using Chatbeep.');

  // Contacts & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selectedUser, setSelectedUser] = useState<Contact | null>(null);

  // Chat & Messaging
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [uploading, setUploading] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set());

  // Voice Recording State
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    document.title = 'Chatbeep';
  }, []);

  // Check auth session
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user?.email) {
        setDisplayName(session.user.email.split('@')[0]);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user?.email) {
        setDisplayName(session.user.email.split('@')[0]);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // Realtime Presence
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
        if (status === 'SUBSCRIBED') {
          await room.track({ online_at: new Date().toISOString() });
        }
      });

    return () => {
      supabase.removeChannel(room);
    };
  }, [user]);

  // Handle Contact Search / Addition
  const handleAddContact = () => {
    if (!searchQuery.trim()) return;
    const newContact: Contact = {
      id: searchQuery.trim(),
      email: searchQuery.trim(),
    };

    if (!contacts.some((c) => c.email.toLowerCase() === newContact.email.toLowerCase())) {
      setContacts((prev) => [...prev, newContact]);
    }
    setSelectedUser(newContact);
  };

  // Auth Operations
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

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  // Send Text Message
  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!newMessage.trim() || !user || !selectedUser) return;

    const msg = {
      sender_id: user.email || user.id,
      recipient_id: selectedUser.email,
      content: newMessage,
      created_at: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, { ...msg, id: Math.random().toString() }]);
    setNewMessage('');

    await supabase.from('messages').insert([msg]);
  };

  // Image Attachment Upload
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0 || !user || !selectedUser) return;
    try {
      setUploading(true);
      const file = e.target.files[0];
      const fileExt = file.name.split('.').pop();
      const filePath = `images/${Math.random()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('chat-attachments')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data } = supabase.storage
        .from('chat-attachments')
        .getPublicUrl(filePath);

      const msg = {
        sender_id: user.email || user.id,
        recipient_id: selectedUser.email,
        content: '📷 Image Attachment',
        image_url: data.publicUrl,
        created_at: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, { ...msg, id: Math.random().toString() }]);
      await supabase.from('messages').insert([msg]);
    } catch (err: any) {
      console.error('Upload error:', err?.message || err);
    } finally {
      setUploading(false);
    }
  };

  // Voice Recording Handlers
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        await uploadAudioMessage(audioBlob);
        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      alert('Microphone permission required for voice notes.');
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

      const { error: uploadError } = await supabase.storage
        .from('chat-attachments')
        .upload(filePath, audioBlob);

      if (uploadError) throw uploadError;

      const { data } = supabase.storage
        .from('chat-attachments')
        .getPublicUrl(filePath);

      const msg = {
        sender_id: user.email || user.id,
        recipient_id: selectedUser.email,
        content: '🎙️ Voice Note',
        audio_url: data.publicUrl,
        created_at: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, { ...msg, id: Math.random().toString() }]);
      await supabase.from('messages').insert([msg]);
    } catch (err: any) {
      console.error('Audio upload error:', err?.message || err);
    } finally {
      setUploading(false);
    }
  };

  // 1. Auth View
  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen min-h-[100dvh] bg-black text-white p-4">
        <div className="w-full max-w-md bg-zinc-950 p-6 rounded-xl border border-blue-900/50 shadow-2xl">
          <div className="flex items-center space-x-3 mb-6">
            <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center font-bold text-lg text-white">
              CB
            </div>
            <div>
              <h1 className="text-2xl font-bold text-blue-400">Chatbeep</h1>
              <p className="text-xs text-gray-400">Messaging Platform</p>
            </div>
          </div>

          <form onSubmit={handleAuth} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-gray-400 mb-1">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500 text-sm"
                placeholder="you@example.com"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-400 mb-1">Password</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500 text-sm"
                placeholder="••••••••"
              />
            </div>

            {authError && <p className="text-red-400 text-xs">{authError}</p>}

            <button
              type="submit"
              className="w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold py-2 rounded-lg transition"
            >
              {authMode === 'login' ? 'Sign In' : 'Create Account'}
            </button>
          </form>

          <div className="mt-4 text-center">
            <button
              onClick={() => setAuthMode(authMode === 'login' ? 'signup' : 'login')}
              className="text-xs text-blue-400 hover:underline"
            >
              {authMode === 'login'
                ? "Don't have an account? Sign Up"
                : 'Already have an account? Sign In'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  const filteredContacts = contacts.filter((c) =>
    c.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex h-screen h-[100dvh] bg-black text-white overflow-hidden relative">
      {/* Settings & Profile Modal */}
      {showSettings && (
        <div className="absolute inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-zinc-950 border border-blue-900/50 rounded-xl p-6 w-full max-w-md relative">
            <button
              onClick={() => setShowSettings(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>
            <h2 className="text-xl font-bold text-blue-400 mb-4 flex items-center space-x-2">
              <Settings className="w-5 h-5" />
              <span>Profile Settings</span>
            </h2>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-400 mb-1">
                  Display Name
                </label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-400 mb-1">
                  Status Message
                </label>
                <input
                  type="text"
                  value={statusMessage}
                  onChange={(e) => setStatusMessage(e.target.value)}
