import { io } from 'socket.io-client';

export const socket = io(window.location.origin, {
  path: '/socket.io',
  autoConnect: false,
  auth: (cb) => {
    cb({ token: localStorage.getItem('mdm_token') });
  }
});
