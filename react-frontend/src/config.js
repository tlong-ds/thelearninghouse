const config = {
  development: {
    API_URL: 'http://localhost:8503',
  },
  production: {
    // Replace with your deployed backend URL when available
    API_URL: 'https://thelearninghouse-backend.example.com',
  }
};

const env = process.env.NODE_ENV || 'development';
export default config[env];
