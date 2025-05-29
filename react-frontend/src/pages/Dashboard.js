import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { fetchDashboardData } from '../services/api';
import { useAuth } from '../services/AuthContext';
import { useLoading } from '../services/LoadingContext';
import Header from '../components/Header';
import '../styles/Dashboard.css';

// Line chart component for statistics
const StatisticsChart = ({ data, title, yAxisLabel, color }) => {
  const chartRef = useRef(null);
  
  if (!data || data.length === 0) {
    return <div className="no-data-message">No data available for this chart.</div>;
  }

  // Calculate chart dimensions
  const chartWidth = 500;
  const chartHeight = 280;
  const padding = { top: 20, right: 30, bottom: 40, left: 50 };
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
    <div className="statistics-chart">
      <h3>{title}</h3>
      <svg width={chartWidth} height={chartHeight} ref={chartRef}>
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
          <g key={i} className="data-point">
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
        ))}
      </svg>
    </div>
  );
};

// Progress bar component
const ProgressBar = ({ percentage }) => {
  return (
    <div className="progress-container">
      <div className="progress-bar" style={{ width: `${percentage}%` }}>
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
  
  if (error || !dashboardData) {
    return (
      <div className="dashboard-container">
        <Header username={currentUser?.username} role={currentUser?.role} onLogout={logout} />
        <div className="error">{error || 'Dashboard data not found'}</div>
      </div>
    );
  }
  
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
  
  const sortedEnrolledCourses = sortCourses(dashboardData.enrolledCourses);
  
  return (
    <div className="dashboard-container">
      <Header username={currentUser?.username} role={currentUser?.role} onLogout={logout} />
      
      <div className="dashboard-content">
        <h1>Learning Dashboard</h1>
        <p className="greeting">Hello <span className="username">{dashboardData.learnerName}</span> - here's your progress overview.</p>
        
        <div className="metrics-container">
          <div className="metric-card">
            <h3>Courses Enrolled</h3>
            <div className="metric-value">{dashboardData.enrolled}</div>
          </div>
          
          <div className="metric-card">
            <h3>Courses Completed</h3>
            <div className="metric-value">{dashboardData.completed}</div>
          </div>
          
          <div className="metric-card">
            <h3>Completion Rate</h3>
            <div className="metric-value">{dashboardData.completionRate}</div>
          </div>
          
          <div className="metric-card">
            <h3>Lectures Passed</h3>
            <div className="metric-value">{dashboardData.lecturesPassed}</div>
          </div>
        </div>
        
        <div className="tabs-container">
          <div className="tabs">
            <button 
              className={`tab ${activeTab === 'statistics' ? 'active' : ''}`}
              onClick={() => setActiveTab('statistics')}
            >
              Statistics
            </button>
            <button 
              className={`tab ${activeTab === 'courses' ? 'active' : ''}`}
              onClick={() => setActiveTab('courses')}
            >
              Enrolled Courses
            </button>
          </div>
          
          <div className="tab-content">
            {activeTab === 'statistics' && (
              <div className="statistics-tab">
                {(dashboardData.statistics.lecturesPassed.length === 0 && dashboardData.statistics.averageScores.length === 0) ? (
                  <div className="no-data-message">
                    <p>You haven't passed any lecture quizzes yet. Complete quizzes to see your statistics.</p>
                    <button 
                      className="view-courses-btn"
                      onClick={() => setActiveTab('courses')}
                    >
                      View Your Courses
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="time-filter-controls">
                      <span>Time Range:</span>
                      <button 
                        className={`time-filter-btn ${timeFilter === 'all' ? 'active' : ''}`}
                        onClick={() => {
                          setIsAnimating(true);
                          setTimeFilter('all');
                          setTimeout(() => setIsAnimating(false), 500);
                        }}
                      >
                        All Time
                      </button>
                      <button 
                        className={`time-filter-btn ${timeFilter === 'month' ? 'active' : ''}`}
                        onClick={() => {
                          setIsAnimating(true);
                          setTimeFilter('month');
                          setTimeout(() => setIsAnimating(false), 500);
                        }}
                      >
                        Last Month
                      </button>
                      <button 
                        className={`time-filter-btn ${timeFilter === 'week' ? 'active' : ''}`}
                        onClick={() => {
                          setIsAnimating(true);
                          setTimeFilter('week');
                          setTimeout(() => setIsAnimating(false), 500);
                        }}
                      >
                        Last Week
                      </button>
                      <button 
                        className={`time-filter-btn ${timeFilter === 'day' ? 'active' : ''}`}
                        onClick={() => {
                          setIsAnimating(true);
                          setTimeFilter('day');
                          setTimeout(() => setIsAnimating(false), 500);
                        }}
                      >
                        Last 24 Hours
                      </button>
                    </div>
                    
                    <div className={`charts-container ${isAnimating ? 'animating' : ''}`}>
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
              <div className="courses-tab">
                {dashboardData.enrolledCourses.length === 0 ? (
                  <div className="no-data-message">
                    <p>You are not enrolled in any courses yet.</p>
                    <button 
                      className="browse-courses-btn"
                      onClick={() => navigate('/courses')}
                    >
                      Browse Courses
                    </button>
                  </div>
                ) : (
                  <div className="enrolled-courses">
                    <div className="courses-header">
                      <h2>Your Courses</h2>
                      <div className="course-controls">
                        <select 
                          value={sortBy}
                          onChange={handleSortChange}
                        >
                          <option value="name">Sort by Name</option>
                          <option value="instructor">Sort by Instructor</option>
                          <option value="progress">Sort by Progress</option>
                        </select>
                        <button 
                          className="sort-order-btn"
                          onClick={toggleSortOrder}
                        >
                          {sortOrder === 'asc' ? '↑' : '↓'}
                        </button>
                      </div>
                    </div>
                    <div className="courses-list">
                      {sortCourses(dashboardData.enrolledCourses).map(course => (
                        <div key={course.id} className="course-card">
                          <div className="course-info">
                            <h3>{course.name}</h3>
                            <p className="instructor">{course.instructor}</p>
                            <div className="progress-info">
                              <p>Progress: {course.percentage || 0}%</p>
                              <ProgressBar percentage={course.percentage || 0} />
                            </div>
                          </div>
                          <div className="course-actions">
                            <Link to={`/course/${course.id}`} className="student-view-course-btn">
                              View Course
                            </Link>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
