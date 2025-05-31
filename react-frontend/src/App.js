import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './services/AuthContext';
import { LoadingProvider, useLoading } from './services/LoadingContext';
import { SSRProvider } from 'react-bootstrap';
import 'bootstrap/dist/css/bootstrap.min.css';
import Loading from './components/Loading';
import Header from './components/Header';
import Login from './pages/Login';
import Courses from './pages/Courses';
import AddCourse from './pages/AddCourse';
import AddLecture from './pages/AddLecture';
import Edumate from './pages/Edumate';
import CoursePreview from './pages/CoursePreview';
import ManageCourse from './pages/ManageCourse';
import LecturePreview from './pages/LecturePreview';
import QuizPage from './pages/QuizPage';
import Settings from './pages/Settings';
import Dashboard from './pages/Dashboard';
import InstructorDashboard from './pages/InstructorDashboard';
import About from './pages/About';
import { setScrollbarWidth } from './utils/scrollbar';
import './styles/App.css';

// Helper component to conditionally render header
const ConditionalHeader = () => {
  const location = useLocation();
  const { isAuthenticated, currentUser, logout, loading } = useAuth();
  
  // Don't show header on login page
  if (location.pathname === '/login') {
    return null;
  }
  
  // Show header when authenticated
  if (isAuthenticated && currentUser) {
    return (
      <Header 
        username={currentUser.username} 
        role={currentUser.role} 
        onLogout={logout} 
      />
    );
  }
  
  return null;
};

// Protected route component that checks role
const ProtectedRoute = ({ children, requiredRole }) => {
  const { isAuthenticated, currentUser } = useAuth();
  
  if (!isAuthenticated) {
    return <Navigate to="/login" />;
  }
  
  if (requiredRole && currentUser?.role !== requiredRole) {
    return <Navigate to="/" />;
  }
  
  return children;
};

const AppContent = () => {
  const { loading, loadingMessage, showProgress, progress } = useLoading();

  return (
    <Router basename="/thelearninghouse">
      {/* Static Header */}
      <ConditionalHeader />

      <div className="app-layout">
        {/* Main Content Area */}
        <main className="main-content">
          {loading && (
            <Loading 
              fullscreen 
              message={loadingMessage}
              showProgress={showProgress}
              progress={progress}
            />
          )}
          
          <div className="App">
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route 
                path="/instructor/dashboard" 
                element={
                  <ProtectedRoute requiredRole="Instructor">
                    <InstructorDashboard />
                  </ProtectedRoute>
                } 
              />
              <Route 
                path="/edumate" 
                element={
                  <ProtectedRoute>
                    <Edumate />
                  </ProtectedRoute>
                } 
              />
              <Route 
                path="/courses" 
                element={
                  <ProtectedRoute>
                    <Courses />
                  </ProtectedRoute>
                } 
              />
              <Route 
                path="/course/:id" 
                element={
                  <ProtectedRoute>
                    <CoursePreview />
                  </ProtectedRoute>
                } 
              />
              <Route 
                path="/lecture/:id" 
                element={
                  <ProtectedRoute>
                    <LecturePreview />
                  </ProtectedRoute>
                } 
              />
              <Route 
                path="/quiz/:lectureId" 
                element={
                  <ProtectedRoute>
                    <QuizPage />
                  </ProtectedRoute>
                } 
              />
              <Route 
                path="/manage-course/:courseId" 
                element={
                  <ProtectedRoute>
                    <ManageCourse />
                  </ProtectedRoute>
                } 
              />
              <Route 
                path="/settings" 
                element={
                  <ProtectedRoute>
                    <Settings />
                  </ProtectedRoute>
                } 
              />
              <Route 
                path="/dashboard" 
                element={
                  <ProtectedRoute>
                    <Dashboard />
                  </ProtectedRoute>
                } 
              />
              <Route 
                path="/add-course" 
                element={
                  <ProtectedRoute>
                    <AddCourse />
                  </ProtectedRoute>
                } 
              />
              <Route 
                path="/add-lecture/:courseId" 
                element={
                  <ProtectedRoute>
                    <AddLecture />
                  </ProtectedRoute>
                } 
              />
              <Route path="/" element={<About />} />
            </Routes>
          </div>
        </main>
      </div>
    </Router>
    );
};

function App() {
  // Initialize scrollbar width detection on app start
  useEffect(() => {
    // Set initial scrollbar width
    setScrollbarWidth();
    
    // Update on window load to ensure all content is loaded
    const handleLoad = () => {
      setScrollbarWidth();
    };
    
    window.addEventListener('load', handleLoad);
    
    return () => {
      window.removeEventListener('load', handleLoad);
    };
  }, []);

  return (
    <SSRProvider>
      <AuthProvider>
        <LoadingProvider>
          <AppContent />
        </LoadingProvider>
      </AuthProvider>
    </SSRProvider>
  );
}

export default App;
