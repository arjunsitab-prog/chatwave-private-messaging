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
  Volume2,
  Check,
  Trash2,
  ChevronDown,
  Archive,
  VolumeX,
  Pin,
  Mail,
  Heart,
  Ban,
  Eraser,
  Inbox,
  MoreVertical,
  CheckSquare,
  Clock,
  ListPlus,
  Download,
  Link,
  PhoneCall,
  Flag
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

  // Profile & Settings State
  const [showSettings, setShowSettings] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [statusMessage, setStatusMessage] = useState('Hey there! I am using Chatbeep.');

  // Contacts, Search & Archive View
  const [searchQuery, setSearchQuery] = useState('');
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selectedUser, setSelectedUser] = useState<Contact | null>(null);
  const [openMenuContactId, setOpenMenuContactId] = useState<string | null>(null);
  const [viewArchived, setViewArchived] = useState(false);

  // Top-Right Chat Header Menu State
  const [showChatHeaderMenu, setShowChatHeaderMenu] = useState(false);

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
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.title = 'Chatbeep';
    if (typeof window !== 'undefined' && 'Notification' in window) {
      Notification.requestPermission();
    }
  }, []);

  // Auto-scroll to bottom of messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Close context menus when clicking outside
  useEffect(() => {
    const handleClickOutside = () => {
      setOpenMenuContactId(null);
      setShowChatHeaderMenu(false);
    };
    window.addEventListener('click', handleClickOutside);
    return () => window.removeEventListener('click', handleClickOutside);
  }, []);

  // Persistent Session Handler
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user?.email) {
        setDisplayName(session.user.email.split('@')[0]);
      }
      setLoadingSession(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user?.email) {
        setDisplayName(session.user.email.split('@')[0]);
      }
      setLoadingSession(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Fetch saved contacts from message history
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

        const loadedContacts: Contact[] = Array.from(contactSet).map((contactEmail) => ({
          id: contactEmail,
          email: contactEmail,
        }));

        setContacts(loadedContacts);
      }
    };

    fetchSavedContacts();
  }, [user]);

  // Realtime Presence Sync
  useEffect(() => {
    if (!user) return;

    const room = supabase.channel('online-users', {
      config: { presence: { key: user.email || user.id } },
    });

    room
      .on('presence', { event: 'sync' }, () => {
        const state = room.presenceState();
        setOnlineUsers
