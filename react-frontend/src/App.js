import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './services/AuthContext';
import { SSRProvider } from 'react-bootstrap';
import 'bootstrap/dist/css/bootstrap.min.css';
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
import './styles/App.css';

// Protected route component that checks role
const ProtectedRoute = ({ children, requiredRole }) => {
  const { isAuthenticated, currentUser } = useAuth();
  
  if (!isAuthenticated) {
    return <Navigate to="/login" />;
  }
  
  if (requiredRole && currentUser?.role !== requiredRole) {
    return <Navigate to="/courses" />;
  }
  
  return children;
};

function App() {
  return (
    <AuthProvider>
      <Router basename="/thelearninghouse">
        <div className="App">
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/about" element={<About />} />
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
            <Route path="/" element={<Navigate to="/login" />} />
          </Routes>
        </div>
      </Router>
    </AuthProvider>
  );
}

export default App;
