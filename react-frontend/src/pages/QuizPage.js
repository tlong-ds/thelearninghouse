import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { fetchLectureDetails } from '../services/api';
import Quiz from '../components/Quiz';
import Header from '../components/Header';
import { useAuth } from '../services/AuthContext';
import '../styles/QuizPage.css';

const QuizPage = () => {
  const { lectureId } = useParams();
  const [lecture, setLecture] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const { currentUser, logout } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        const data = await fetchLectureDetails(lectureId);
        
        // Debug the received data
        console.log('Lecture data in QuizPage:', data);
        
        if (!data || !data.quiz) {
          console.error('No quiz data found in lecture:', data);
          setError('No quiz available for this lecture.');
          setLoading(false);
          return;
        }
        
        // Verify the quiz structure has questions
        if (!data.quiz.questions || Object.keys(data.quiz.questions).length === 0) {
          console.error('Quiz has no questions:', data.quiz);
          setError('This quiz has no questions.');
          setLoading(false);
          return;
        }
        
        setLecture(data);
        setLoading(false);
      } catch (err) {
        console.error('Error loading quiz:', err);
        setError('Failed to load quiz. Please try again later.');
        setLoading(false);
      }
    };

    loadData();
  }, [lectureId, navigate]);

  const handleBack = () => {
    navigate(`/lecture/${lectureId}`);
  };

  if (loading) {
    return (
      <div className="quiz-page">
        <Header username={currentUser?.username} role={currentUser?.role} onLogout={logout} />
        <div className="loading">Loading quiz...</div>
      </div>
    );
  }

  if (error || !lecture) {
    return (
      <div className="quiz-page">
        <Header username={currentUser?.username} role={currentUser?.role} onLogout={logout} />
        <div className="quiz-error-container">
          <div className="error">{error || 'Quiz not found'}</div>
          <button className="back-button" onClick={handleBack} title="Back to Lecture">
            <i className="fas fa-arrow-left"></i>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="quiz-page">
      <Header username={currentUser?.username} role={currentUser?.role} onLogout={logout} />
      
      <div className="quiz-page-content">
        <div className="quiz-navigation">
          <button className="back-button" onClick={handleBack} title="Back to Lecture">
            <i className="fas fa-arrow-left"></i>
          </button>
          <h1>{lecture.title} - Quiz</h1>
        </div>

        <Quiz 
          quiz={lecture.quiz}
          lectureId={lecture.id} 
          onQuizComplete={(score) => {
            // Show completion message without auto-navigation
            console.log(`Quiz completed with score: ${score}%`);
          }}
        />
      </div>
    </div>
  );
};

export default QuizPage;
