<template>
  <div v-if="!isAuthenticated" class="auth-container">
    <div class="auth-content">
      <h1 class="auth-title">Welcome</h1>
      <p class="auth-subtitle">Enter the chatroom</p>
      <form @submit.prevent="handleLogin">
        <input 
          v-model="tempUsername" 
          type="text" 
          class="cyber-input" 
          placeholder="Choose a username..." 
          required 
          autofocus
        />
        <button type="submit" class="cyber-button">
          Join Chat
          <span class="arrow">→</span>
        </button>
      </form>
    </div>
  </div>

  <div v-else class="chat-wrapper">
    <header class="chat-header">
      <div class="header-title">
        <h1>Global Chat</h1>
      </div>
      <div class="online-badge">
        <div class="dot"></div>
        <span>Live</span>
      </div>
    </header>

    <div class="messages-area" ref="messagesContainer">
      <div 
        v-for="(msg, index) in messages" 
        :key="index" 
        class="message"
        :class="{ 'own': msg.username === username, 'other': msg.username !== username }"
      >
        <div class="message-meta">
          <span class="username">{{ msg.username }}</span>
          <span class="timestamp">{{ formatTime(msg.timestamp) }}</span>
        </div>
        <div class="message-content">
          {{ msg.text }}
        </div>
      </div>
    </div>

    <div class="input-area">
      <form @submit.prevent="sendMessage" class="input-form">
        <input 
          v-model="newMessage" 
          type="text" 
          class="chat-input" 
          placeholder="Type a message..." 
        />
        <button type="submit" class="send-btn">Send</button>
      </form>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, nextTick, watch } from 'vue'
import { io } from 'socket.io-client'

const username = ref('')
const tempUsername = ref('')
const isAuthenticated = ref(false)
const messages = ref([])
const newMessage = ref('')
const messagesContainer = ref(null)

let socket = null

const formatTime = (ts) => {
  if (!ts) return ''
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

const scrollToBottom = async () => {
  await nextTick()
  if (messagesContainer.value) {
    messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
  }
}

const handleLogin = () => {
  if (!tempUsername.value.trim()) return
  username.value = tempUsername.value.trim()
  localStorage.setItem('chat_username', username.value)
  isAuthenticated.value = true
}

const sendMessage = () => {
  if (!newMessage.value.trim() || !socket) return
  
  const msg = {
    username: username.value,
    text: newMessage.value,
    timestamp: Date.now()
  }
  

  
  socket.emit('chat_message', msg)
  newMessage.value = ''
}

onMounted(() => {

    const savedName = localStorage.getItem('chat_username')
    if (savedName) {
      username.value = savedName
      isAuthenticated.value = true
    }


    socket = io()

    socket.on('connect', () => {
      console.log('Connected to server')
    })

    socket.on('load_messages', (history) => {
      messages.value = history
      scrollToBottom()
    })

    socket.on('chat_message', (msg) => {
      messages.value.push(msg)
      scrollToBottom()
    })
})
</script>
