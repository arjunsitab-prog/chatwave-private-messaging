'use client';

import React, { useState, useEffect, useRef } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { Send, Image, Trash2, Edit2, Check } from 'lucide-react';

interface Message {
  id: string;
  sender_id: string;
  content: string;
  image_url?: string;
  created_at: string;
  is_edited?: boolean;
}

export default function ChatWindow({ currentUserId, recipientId }: { currentUserId: string; recipientId: string }) {
  const supabase = createClientComponentClient();
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [uploading, setUploading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 1. Request Browser Notification Permissions
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  // 2. Realtime Presence (Online/Offline Status)
  useEffect(() => {
    const room = supabase.channel('online-users', {
      config: { presence: { key: currentUserId } },
    });

    room
      .on('presence', { event: 'sync' }, () => {
        const state = room.presenceState();
        const onlineSet = new Set(Object.keys(state));
        setOnlineUsers(onlineSet);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await room.track({ online_at: new Date().toISOString() });
        }
      });

    return () => {
      supabase.removeChannel(room);
    };
  }, [currentUserId, supabase]);

  // 3. Image Upload Handler
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    try {
      setUploading(true);
      if (!e.target.files || e.target.files.length === 0) return;
      const file = e.target.files[0];
      const fileExt = file.name.split('.').pop();
      const filePath = `${Math.random()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('chat-attachments')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data } = supabase.storage
        .from('chat-attachments')
        .getPublicUrl(filePath);

      await supabase.from('messages').insert([
        {
          sender_id: currentUserId,
          recipient_id: recipientId,
          content: '📷 Image',
          image_url: data.publicUrl,
        },
      ]);
    } catch (err) {
      console.error('Error uploading image:', err);
    } finally {
      setUploading(false);
    }
  };

  // 4. Edit & Delete Handlers
  const handleEdit = async (id: string) => {
    if (!editContent.trim()) return;
    await supabase
      .from('messages')
      .update({ content: editContent, is_edited: true })
      .eq('id', id);
    
    setEditingId(null);
    setEditContent('');
  };

  const handleDelete = async (id: string) => {
    await supabase.from('messages').delete().eq('id', id);
  };

  const isRecipientOnline = onlineUsers.has(recipientId);

  return (
    <div className="flex flex-col h-full bg-black text-white p-4">
      {/* Header with Online Indicator */}
      <div className="flex items-center justify-between pb-4 border-b border-blue-900/40">
        <div className="flex items-center space-x-3">
          <div className="relative">
            <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center font-bold">
              Chat
            </div>
            <span
              className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-black ${
                isRecipientOnline ? 'bg-green-500' : 'bg-gray-500'
              }`}
            />
          </div>
          <div>
            <h3 className="font-semibold text-blue-400">Recipient</h3>
            <p className="text-xs text-gray-400">
              {isRecipientOnline ? 'Online' : 'Offline'}
            </p>
          </div>
        </div>
      </div>

      {/* Message Feed */}
      <div className="flex-1 overflow-y-auto py-4 space-y-3">
        {messages.map((msg) => {
          const isMe = msg.sender_id === currentUserId;
          return (
            <div
              key={msg.id}
              className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}
            >
              <div
                className={`max-w-xs md:max-w-md p-3 rounded-xl ${
                  isMe
                    ? 'bg-blue-600 text-white rounded-br-none'
                    : 'bg-zinc-900 text-gray-200 rounded-bl-none border border-zinc-800'
                }`}
              >
                {msg.image_url && (
                  <img
                    src={msg.image_url}
                    alt="attachment"
                    className="rounded-lg mb-2 max-h-60 object-cover"
                  />
                )}
                {editingId === msg.id ? (
                  <div className="flex items-center space-x-2">
                    <input
                      type="text"
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      className="bg-black/50 text-white px-2 py-1 rounded border border-blue-400 text-sm focus:outline-none"
                    />
                    <button onClick={() => handleEdit(msg.id)}>
                      <Check className="w-4 h-4 text-green-400" />
                    </button>
                  </div>
                ) : (
                  <p className="text-sm">{msg.content}</p>
                )}

                {isMe && (
                  <div className="flex items-center justify-end space-x-2 mt-1 opacity-70 hover:opacity-100">
                    <button
                      onClick={() => {
                        setEditingId(msg.id);
                        setEditContent(msg.content);
                      }}
                    >
                      <Edit2 className="w-3 h-3 text-gray-300" />
                    </button>
                    <button onClick={() => handleDelete(msg.id)}>
                      <Trash2 className="w-3 h-3 text-red-400" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Input Bar */}
      <div className="pt-2 border-t border-blue-900/40 flex items-center space-x-2">
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleImageUpload}
          className="hidden"
          accept="image/*"
        />
        <button
          disabled={uploading}
          onClick={() => fileInputRef.current?.click()}
          className="p-2 text-blue-400 hover:text-blue-300 hover:bg-zinc-900 rounded-lg transition"
        >
          <Image className="w-5 h-5" />
        </button>
        <input
          type="text"
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          placeholder="Type a message..."
          className="flex-1 bg-zinc-900 text-white px-4 py-2 rounded-lg border border-zinc-800 focus:outline-none focus:border-blue-500"
        />
        <button className="p-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition">
          <Send className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}
