import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './lib/AuthContext';
import { Layout } from './components/Layout';
import { RecipeList } from './pages/RecipeList';
import { RecipeDetail } from './pages/RecipeDetail';
import { Auth } from './pages/Auth';
import { ChefHat } from 'lucide-react';
import { Favorites } from './pages/Favorites';
import { AddRecipe } from './pages/AddRecipe';
import { Dashboard } from './pages/Dashboard';

// Temporary Placeholder Components for your new tabs
const Placeholder = ({ title }: { title: string }) => (
  <div className="flex flex-col items-center justify-center h-[80vh] text-slate-500">
    <ChefHat className="w-16 h-16 text-orange-200 mb-4" />
    <h2 className="text-2xl font-bold text-slate-700">{title}</h2>
    <p className="mt-2 text-sm">This module is under construction.</p>
  </div>
);

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Auth Route (No Sidebar) */}
          <Route path="/auth" element={<Auth />} />
          
          {/* Main App Routes (Wrapped in Layout) */}
          <Route path="/" element={<Layout><Navigate to="/recipes" replace /></Layout>} />
          
          <Route path="/recipes" element={<Layout><RecipeList /></Layout>} />
          <Route path="/recipes/:id" element={<Layout><RecipeDetail /></Layout>} />
          
          <Route path="/discovery" element={<Layout><Placeholder title="Discovery Module" /></Layout>} />
          <Route path="/favorites" element={<Layout><Favorites /></Layout>} />
          <Route path="/dashboard" element={<Layout><Dashboard /></Layout>} />
          <Route path="/add" element={<Layout><AddRecipe /></Layout>} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;