import React, { useState } from 'react';
import { submitQuizAnswers } from '../services/api';
import ReactMarkdown from 'react-markdown';
import rehypeRaw from 'rehype-raw';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css'; // Import KaTeX CSS
import '../styles/Quiz.css';

const Quiz = ({ quiz, lectureId, onQuizComplete }) => {
  const [answers, setAnswers] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [score, setScore] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);

  const handleOptionSelect = (questionId, option) => {
    setAnswers(prev => ({
      ...prev,
      [questionId]: option
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      // Validate that we have answers for all questions
      const questionCount = Object.keys(quiz.questions).length;
      const answeredCount = Object.keys(answers).length;
      
      if (answeredCount < questionCount) {
        setError(`Please answer all questions before submitting. (${answeredCount}/${questionCount} answered)`);
        setLoading(false);
        return;
      }

      console.log("Submitting answers:", answers);
      const result = await submitQuizAnswers(lectureId, { answers });
      console.log("Quiz submission result:", result);
      setScore(result.score);
      setSubmitted(true);
      if (onQuizComplete) {
        onQuizComplete(result.score);
      }
    } catch (err) {
      console.error("Quiz submission error:", err);
      
      // Provide more detailed error messages based on the response
      if (err.response) {
        if (err.response.status === 422) {
          setError('The quiz answer format is incorrect. Please try again or contact support.');
        } else if (err.response.status === 404) {
          setError('The quiz could not be found on the server.');
        } else if (err.response.status === 401) {
          setError('Your session has expired. Please log in again.');
        } else {
          setError(`Failed to submit quiz: ${err.response.data?.detail || 'Unknown error'}`);
        }
      } else {
        setError('Failed to submit quiz. Please check your internet connection and try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  // Debug the quiz structure
  console.log("Quiz data received:", quiz);

  if (!quiz || !quiz.questions || Object.keys(quiz.questions).length === 0) {
    return (
      <div className="quiz-container">
        <div className="quiz-error">
          <h2>Quiz Not Available</h2>
          <p>This quiz does not contain any questions or is improperly formatted.</p>
          <p className="quiz-debug">Quiz data structure: {JSON.stringify(quiz)}</p>
        </div>
      </div>
    );
  }

  // Function to navigate to a specific question
  const navigateToQuestion = (index) => {
    setCurrentQuestionIndex(index);
  };

  // Function to navigate to next question
  const nextQuestion = () => {
    if (currentQuestionIndex < Object.keys(quiz.questions).length - 1) {
      setCurrentQuestionIndex(currentQuestionIndex + 1);
    }
  };

  // Function to navigate to previous question
  const prevQuestion = () => {
    if (currentQuestionIndex > 0) {
      setCurrentQuestionIndex(currentQuestionIndex - 1);
    }
  };

  return (
    <div className="quiz-container">
      <h2 className="quiz-title">{quiz.title || 'Quiz'}</h2>
      
      {submitted ? (
        <div className="quiz-results">
          <h2>Quiz Results</h2>
          <p>Your score: {score !== null ? score.toFixed(2) : 0}%</p>
          {score >= 70 ? (
            <p className="success-message">Congratulations! You passed the quiz!</p>
          ) : (
            <p className="error-message">You need 70% or higher to pass. Try again!</p>
          )}
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="quiz-form">
          {/* Left Column - Current Question and Options */}
          <div className="quiz-questions-column">
              {(() => {
                // Get the current question
                const questionIds = Object.keys(quiz.questions);
                if (questionIds.length === 0) return null;
                
                const questionId = questionIds[currentQuestionIndex];
                const questionData = quiz.questions[questionId];
                
                return (
                  <div key={questionId} className="question">
                    <div className="question-progress">
                      Question {currentQuestionIndex + 1} of {questionIds.length}
                    </div>
                    <div className="question-text">
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm, remarkMath]} 
                        rehypePlugins={[rehypeRaw, rehypeKatex]}
                      >
                        {questionData.question}
                      </ReactMarkdown>
                    </div>
                    <div className="options-container">
                      <button 
                        type="button" 
                        className="nav-arrow-button prev"
                        onClick={prevQuestion}
                        disabled={currentQuestionIndex === 0}
                      >
                        ‹
                      </button>
                      <div className="options-grid">
                        {questionData.options.map((option, optionIndex) => (
                          <label 
                            key={optionIndex} 
                            className={`option ${answers[questionId] === option ? 'selected' : ''}`}
                            onClick={() => handleOptionSelect(questionId, option)}
                          >
                            <input
                              type="radio"
                              name={`question-${questionId}`}
                              value={option}
                              checked={answers[questionId] === option}
                              onChange={() => {}} // Empty handler to avoid React warning about controlled components
                            />
                            <div className="option-text">
                              {option}
                            </div>
                          </label>
                        ))}
                      </div>
                      <button 
                        type="button" 
                        className="nav-arrow-button next"
                        onClick={nextQuestion}
                        disabled={currentQuestionIndex === questionIds.length - 1}
                      >
                        ›
                      </button>
                    </div>
                    
                    <div className="question-navigation-buttons">
                      <button 
                        type="button" 
                        className="nav-button prev-button"
                        onClick={prevQuestion}
                        disabled={currentQuestionIndex === 0}
                      >
                        Previous
                      </button>
                      <button 
                        type="button" 
                        className="nav-button next-button"
                        onClick={nextQuestion}
                        disabled={currentQuestionIndex === questionIds.length - 1}
                      >
                        Next
                      </button>
                    </div>
                  </div>
                );
              })()}
              
              {error && <div className="error-message">{error}</div>}
            </div>
            
            {/* Right Column - Question Navigation */}
            <div className="quiz-navigation-column">
              <div className="question-navigation">
                <h3>Question Navigator</h3>
                <div className="question-nav-buttons">
                  {Object.keys(quiz.questions).map((questionId, index) => (
                    <button 
                      key={questionId}
                      type="button"
                      className={`question-nav-button ${answers[questionId] ? 'answered' : ''} ${index === currentQuestionIndex ? 'current' : ''}`}
                      onClick={() => navigateToQuestion(index)}
                    >
                      {index + 1}
                    </button>
                  ))}
                </div>
              </div>
              
              <div className="submit-section">
                <button 
                  type="submit" 
                  className="submit-button"
                  disabled={loading || Object.keys(answers).length !== Object.keys(quiz.questions).length}
                >
                  {loading ? 'Submitting...' : `Submit Quiz (${Object.keys(answers).length}/${Object.keys(quiz.questions).length} answered)`}
                </button>
              </div>
            </div>
        </form>
      )}
    </div>
  );
};

export default Quiz;
