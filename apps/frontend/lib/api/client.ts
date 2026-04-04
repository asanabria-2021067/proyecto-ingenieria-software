import axios from 'axios';

const apiClient = axios.create({
  baseURL: typeof window === 'undefined'
    ? process.env.NEXT_PUBLIC_API_URL
    : '/api',
});

export default apiClient;
