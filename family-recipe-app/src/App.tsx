import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './lib/AuthContext';
import { Layout } from './components/Layout';
import { RecipeList } from './pages/RecipeList';
import { RecipeDetail } from './pages/RecipeDetail';
import { Auth } from './pages/Auth';
import { Favorites } from './pages/Favorites';
import { AddRecipe } from './pages/AddRecipe';
import { Dashboard } from './pages/Dashboard';
import { Admin } from './pages/Admin';
import { Discovery } from './pages/Discovery';
import { MealPlanner } from './pages/MealPlanner';

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
          
          <Route path="/discovery" element={<Layout><Discovery /></Layout>} />
          <Route path="/planner" element={<Layout><MealPlanner /></Layout>} />
          <Route path="/favorites" element={<Layout><Favorites /></Layout>} />
          <Route path="/dashboard" element={<Layout><Dashboard /></Layout>} />
          <Route path="/add" element={<Layout><AddRecipe /></Layout>} />
          <Route path="/admin" element={<Layout><Admin /></Layout>} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;