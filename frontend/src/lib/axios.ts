import axios from 'axios';

const baseURL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';

export const apiClient = axios.create({
  baseURL: `${baseURL}/api`,
  withCredentials: true, 
});

// Перехватчик для автоматического добавления JWT-токена
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});