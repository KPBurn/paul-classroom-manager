import { Toaster } from 'react-hot-toast';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext.jsx';
import AppRoutes from './routes/AppRoutes.jsx';

// Matches Vite's `base`, so routes work when the app is served from a subpath.
const basename = import.meta.env.BASE_URL.replace(/\/$/, '');

export default function App() {
  return (
    <BrowserRouter basename={basename}>
      <AuthProvider>
        <AppRoutes />
        <Toaster
          position="top-right"
          toastOptions={{
            duration: 4000,
            className: '!rounded-lg !border !border-ink-200 !bg-white !px-3 !py-2 !text-sm !text-ink-900 !shadow-lg',
            success: { iconTheme: { primary: 'var(--color-emerald-600)', secondary: '#fff' } },
            error: { iconTheme: { primary: 'var(--color-red-600)', secondary: '#fff' } },
          }}
        />
      </AuthProvider>
    </BrowserRouter>
  );
}
