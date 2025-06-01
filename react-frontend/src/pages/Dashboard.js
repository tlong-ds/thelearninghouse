import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { fetchDashboardData } from '../services/api';
import { useAuth } from '../services/AuthContext';
import { useLoading } from '../services/LoadingContext';
import '../styles/Dashboard.css';

// Line chart component for statistics
const StatisticsChart = ({ data, title, yAxisLabel, color }) => {
  const chartRef = useRef(null);
  const [chartDimensions, setChartDimensions] = useState({ width: 500, height: 280 });
  
  useEffect(() => {
    const updateDimensions = () => {
      if (chartRef.current) {
        const containerWidth = chartRef.current.parentElement.offsetWidth;
        const isMobile = window.innerWidth <= 768;
        const isSmallMobile = window.innerWidth <= 480;
        
        const width = Math.min(containerWidth - 32, isSmallMobile ? 340 : isMobile ? 450 : 500);
        const height = isSmallMobile ? 240 : isMobile ? 260 : 280;
        
        setChartDimensions({ width, height });
      }
    };

    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, []);
  
  if (!data || data.length === 0) {
    return <div className="dashboard-no-data-message">No data available for this chart.</div>;
  }

  // Calculate chart dimensions
  const chartWidth = chartDimensions.width;
  const chartHeight = chartDimensions.height;
  const padding = { 
    top: 20, 
    right: window.innerWidth <= 480 ? 20 : 30, 
    bottom: window.innerWidth <= 480 ? 35 : 40, 
    left: window.innerWidth <= 480 ? 40 : 50 
  };
  const chartInnerWidth = chartWidth - padding.left - padding.right;
  const chartInnerHeight = chartHeight - padding.top - padding.bottom;
  
  // Calculate scales
  const dataMax = Math.max(...data.map(d => d.value));
  const yScale = value => chartInnerHeight - (value / dataMax) * chartInnerHeight;
  const xScale = index => (index / (data.length - 1)) * chartInnerWidth;
  
  // Generate points for the line
  const points = data.map((d, i) => ({
    x: xScale(i) + padding.left,
    y: yScale(d.value) + padding.top,
    date: d.date,
    value: d.value
  }));
  
  // Create SVG path
  const linePath = `M ${points.map(p => `${p.x},${p.y}`).join(' L ')}`;
  
  return (
    <div className="dashboard-statistics-chart">
      <h3>{title}</h3>
      <div className="dashboard-chart-svg-container">
        <svg 
          width="100%" 
          height="100%" 
          viewBox={`0 0 ${chartWidth} ${chartHeight}`} 
          preserveAspectRatio="xMidYMid meet"
          ref={chartRef}
        >
        {/* Y-axis */}
        <line 
          x1={padding.left} 
          y1={padding.top} 
          x2={padding.left} 
          y2={chartHeight - padding.bottom} 
          stroke="#ccc" 
        />
        {/* X-axis */}
        <line 
          x1={padding.left} 
          y1={chartHeight - padding.bottom} 
          x2={chartWidth - padding.right} 
          y2={chartHeight - padding.bottom} 
          stroke="#ccc" 
        />
        
        {/* Y-axis label */}
        <text 
          x={10} 
          y={chartHeight / 2} 
          transform={`rotate(-90, 10, ${chartHeight / 2})`} 
          textAnchor="middle"
          fontSize="12"
        >
          {yAxisLabel}
        </text>
        
        {/* Y-axis ticks */}
        {Array.from({ length: 5 }).map((_, i) => {
          const value = dataMax * (i / 4);
          const y = yScale(value) + padding.top;
          return (
            <g key={i}>
              <line
                x1={padding.left - 5}
                y1={y}
                x2={padding.left}
                y2={y}
                stroke="#ccc"
              />
              <text
                x={padding.left - 10}
                y={y + 4}
                fontSize="10"
                textAnchor="end"
              >
                {Math.round(value)}
              </text>
            </g>
          );
        })}
        
        {/* X-axis labels (dates) */}
        {points.map((point, i) => {
          // Only show some labels to prevent overcrowding
          if (i % Math.max(1, Math.floor(points.length / 5)) === 0 || i === points.length - 1) {
            return (
              <text
                key={i}
                x={point.x}
                y={chartHeight - padding.bottom + 20}
                fontSize="10"
                textAnchor="middle"
              >
                {point.date}
              </text>
            );
          }
          return null;
        })}
        
        {/* Line */}
        <path d={linePath} fill="none" stroke={color} strokeWidth="2" />
        
        {/* Points */}
        {points.map((point, i) => (
          <g key={i} className="dashboard-data-point">
            <circle
              cx={point.x}
              cy={point.y}
              r="4"
              fill="white"
              stroke={color}
              strokeWidth="2"
            />
            <title>{`Date: ${point.date}, ${yAxisLabel}: ${point.value}`}</title>
          </g>
        ))}        </svg>
      </div>
    </div>
  );
};

// Progress bar component
const ProgressBar = ({ percentage }) => {
  return (
    <div className="dashboard-progress-container">
      <div className="dashboard-progress-bar" style={{ width: `${percentage}%` }}>
      </div>
    </div>
  );
};

const Dashboard = () => {
  const [dashboardData, setDashboardData] = useState(null);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('statistics');
  const [timeFilter, setTimeFilter] = useState('all'); // 'day', 'week', 'month', 'all'
  const [isAnimating, setIsAnimating] = useState(false);
  const [sortBy, setSortBy] = useState('name');
  const [sortOrder, setSortOrder] = useState('asc');
  
  const { currentUser, logout } = useAuth();
  const { startLoading, stopLoading } = useLoading();
  const navigate = useNavigate();
  
  useEffect(() => {
    const loadDashboardData = async () => {
      try {
        startLoading('Loading dashboard data...');
        setError('');
        
        const data = await fetchDashboardData();
        setDashboardData(data);
        stopLoading();
      } catch (err) {
        console.error('Failed to fetch dashboard data:', err);
        setError('Failed to load dashboard data. Please try again later.');
        stopLoading();
      }
    };
    
    loadDashboardData();
  }, [startLoading, stopLoading]);
  
  // Handle course card navigation
  const handleCourseClick = (courseId) => {
    navigate(`/course/${courseId}`);
  };

  // Prepare data for charts and sorting (only when dashboardData exists)
  const renderDashboardContent = () => {
    if (!dashboardData) return null;
    
    // Format data for charts
    const filterDataByTime = (data) => {
      if (timeFilter === 'all') return data;
      
      const now = new Date();
      const filterDate = new Date();
      
      if (timeFilter === 'day') {
        filterDate.setDate(now.getDate() - 1);
      } else if (timeFilter === 'week') {
        filterDate.setDate(now.getDate() - 7);
      } else if (timeFilter === 'month') {
        filterDate.setMonth(now.getMonth() - 1);
      }
      
      return data.filter(item => {
        const itemDate = new Date(item.date);
        return itemDate >= filterDate;
      });
    };
    
    const sortData = (data) => {
      const sortedData = [...data];
      
      sortedData.sort((a, b) => {
        if (sortBy === 'date') {
          return sortOrder === 'asc' 
            ? new Date(a.date) - new Date(b.date) 
            : new Date(b.date) - new Date(a.date);
        } else {
          return sortOrder === 'asc' 
            ? a.value - b.value 
            : b.value - a.value;
        }
      });
      
      return sortedData;
    };
    
    const lecturesPassedData = sortData(filterDataByTime(dashboardData.statistics.lecturesPassed.map(item => ({
      date: item.date,
      value: item.count
    }))));
    
    const averageScoresData = filterDataByTime(dashboardData.statistics.averageScores.map(item => ({
      date: item.date,
      value: item.score
    })));
    
    // Sort enrolled courses
    const sortCourses = (courses) => {
      return [...courses].sort((a, b) => {
        let comparison = 0;
        
        switch (sortBy) {
          case 'name':
            comparison = a.name.localeCompare(b.name);
            break;
          case 'instructor':
            comparison = a.instructor.localeCompare(b.instructor);
            break;
          case 'progress':
            comparison = (a.percentage || 0) - (b.percentage || 0);
            break;
          default:
            comparison = 0;
        }
        
        return sortOrder === 'asc' ? comparison : -comparison;
      });
    };
    
    const handleSortChange = (e) => {
      setSortBy(e.target.value);
    };
    
    const toggleSortOrder = () => {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    };
    
    return (
      <div className="dashboard-content">
        <h1>Learning Dashboard</h1>
        <p className="dashboard-greeting">Hello <span className="dashboard-username">{dashboardData.learnerName}</span> - here's your progress overview.</p>
        
        <div className="dashboard-metrics-container">
          <div className="dashboard-metric-card">
            <h3>Courses Enrolled</h3>
            <div className="dashboard-metric-value">{dashboardData.enrolled}</div>
          </div>
          
          <div className="dashboard-metric-card">
            <h3>Courses Completed</h3>
            <div className="dashboard-metric-value">{dashboardData.completed}</div>
          </div>
          
          <div className="dashboard-metric-card">
            <h3>Completion Rate</h3>
            <div className="dashboard-metric-value">{dashboardData.completionRate}</div>
          </div>
          
          <div className="dashboard-metric-card">
            <h3>Lectures Passed</h3>
            <div className="dashboard-metric-value">{dashboardData.lecturesPassed}</div>
          </div>
        </div>
        
        <div className="dashboard-tabs-container">
          <div className="dashboard-tabs">
            <button 
              className={`dashboard-tab ${activeTab === 'statistics' ? 'active' : ''}`}
              onClick={() => setActiveTab('statistics')}
            >
              Statistics
            </button>
            <button 
              className={`dashboard-tab ${activeTab === 'courses' ? 'active' : ''}`}
              onClick={() => setActiveTab('courses')}
            >
              Enrolled Courses
            </button>
          </div>
          
          <div className="dashboard-tab-content">
            {activeTab === 'statistics' && (
              <div className="dashboard-statistics-tab scrollbar-hidden">
                {(dashboardData.statistics.lecturesPassed.length === 0 && dashboardData.statistics.averageScores.length === 0) ? (
                  <div className="dashboard-no-data-message">
                    <p>You haven't passed any lecture quizzes yet. Complete quizzes to see your statistics.</p>
                    <button 
                      className="dashboard-view-courses-btn"
                      onClick={() => setActiveTab('courses')}
                    >
                      View Your Courses
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="dashboard-time-filter-controls">
                      <span>Time Range:</span>
                      <button 
                        className={`dashboard-time-filter-btn ${timeFilter === 'all' ? 'active' : ''}`}
                        onClick={() => {
                          setIsAnimating(true);
                          setTimeFilter('all');
                          setTimeout(() => setIsAnimating(false), 500);
                        }}
                      >
                        All Time
                      </button>
                      <button 
                        className={`dashboard-time-filter-btn ${timeFilter === 'month' ? 'active' : ''}`}
                        onClick={() => {
                          setIsAnimating(true);
                          setTimeFilter('month');
                          setTimeout(() => setIsAnimating(false), 500);
                        }}
                      >
                        Last Month
                      </button>
                      <button 
                        className={`dashboard-time-filter-btn ${timeFilter === 'week' ? 'active' : ''}`}
                        onClick={() => {
                          setIsAnimating(true);
                          setTimeFilter('week');
                          setTimeout(() => setIsAnimating(false), 500);
                        }}
                      >
                        Last Week
                      </button>
                      <button 
                        className={`dashboard-time-filter-btn ${timeFilter === 'day' ? 'active' : ''}`}
                        onClick={() => {
                          setIsAnimating(true);
                          setTimeFilter('day');
                          setTimeout(() => setIsAnimating(false), 500);
                        }}
                      >
                        Last 24 Hours
                      </button>
                    </div>
                    
                    <div className={`dashboard-charts-container ${isAnimating ? 'animating' : ''}`}>
                      <StatisticsChart 
                        data={lecturesPassedData} 
                        title="Lectures Passed Over Time" 
                        yAxisLabel="Lectures Passed" 
                        color="#4CAF50" 
                      />
                      
                      <StatisticsChart 
                        data={averageScoresData} 
                        title="Average Scores Over Time" 
                        yAxisLabel="Average Score" 
                        color="#2196F3" 
                      />
                    </div>
                  </>
                )}
              </div>
            )}
            
            {activeTab === 'courses' && (
              <div className="dashboard-courses-tab">
                {dashboardData.enrolledCourses.length === 0 ? (
                  <div className="dashboard-no-data-message">
                    <p>You are not enrolled in any courses yet.</p>
                    <button 
                      className="dashboard-browse-courses-btn"
                      onClick={() => navigate('/courses')}
                    >
                      Browse Courses
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="dashboard-course-controls">
                      <select 
                        value={sortBy}
                        onChange={handleSortChange}
                      >
                        <option value="name">Name</option>
                        <option value="instructor">Instructor</option>
                        <option value="progress">Progress</option>
                      </select>
                      <button 
                        className="dashboard-sort-order-btn"
                        onClick={toggleSortOrder}
                      >
                        {sortOrder === 'asc' ? '↑' : '↓'}
                      </button>
                    </div>
                    <div className="dashboard-courses-list scrollbar-auto-hide">
                      {sortCourses(dashboardData.enrolledCourses).map(course => (
                        <div 
                          key={course.id} 
                          className="dashboard-course-card"
                          onClick={() => handleCourseClick(course.id)}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              handleCourseClick(course.id);
                            }
                          }}
                        >
                          <div className="dashboard-course-info">
                            <h3>{course.name}</h3>
                            <p className="dashboard-instructor">{course.instructor}</p>
                            <div className="dashboard-progress-info">
                              <p>Progress: {course.percentage || 0}%</p>
                              <ProgressBar percentage={course.percentage || 0} />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };
  
  // Single return statement for the entire component
  return (
    <div className="dashboard-container">
      {error ? (
        <div className="error-container">
          <div className="error-message">{error}</div>
        </div>
      ) : !dashboardData ? (
        <div className="dashboard-placeholder">
          {/* Empty placeholder that takes space but shows nothing */}
        </div>
      ) : (
        renderDashboardContent()
      )}
    </div>
  );
};

export default Dashboard;
