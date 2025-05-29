import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../services/AuthContext';
import { fetchInstructorDashboard } from '../services/api';
import Header from '../components/Header';
import '../styles/InstructorDashboard.css';

// Unified StatisticsChart component
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
        
        {/* X-axis labels */}
        {points.map((point, i) => {
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
      <div 
        className="progress-bar" 
        style={{ width: `${percentage}%` }}
      >
        <span className="progress-text">{percentage}%</span>
      </div>
    </div>
  );
};

// Metric Card component
const MetricCard = ({ title, value, trend }) => {
  return (
    <div className="metric-card">
      <h3>{title}</h3>
      <div className="metric-value">{value}</div>
      {trend && (
        <div className={`metric-trend ${trend > 0 ? 'positive' : 'negative'}`}>
          {trend > 0 ? '↑' : '↓'} {Math.abs(trend)}%
        </div>
      )}
    </div>
  );
};

const InstructorDashboard = () => {
  const [dashboardData, setDashboardData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('statistics');
  const [timeFilter, setTimeFilter] = useState('all');
  const [sortBy, setSortBy] = useState('enrollments');
  const [sortOrder, setSortOrder] = useState('desc');
  const [isAnimating, setIsAnimating] = useState(false);

  const { currentUser, logout } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    // Redirect if not an instructor
    if (currentUser && currentUser.role !== 'Instructor') {
      navigate('/courses');
      return;
    }

    const loadDashboardData = async () => {
      try {
        setLoading(true);
        setError('');
        const data = await fetchInstructorDashboard();
        setDashboardData(data);
      } catch (err) {
        console.error('Failed to load dashboard:', err);
        setError('Failed to load dashboard data. Please try again later.');
      } finally {
        setLoading(false);
      }
    };

    loadDashboardData();
  }, [currentUser, navigate]);

  // Format data for charts
  const filterDataByTime = (data) => {
    if (!data) return [];
    if (timeFilter === 'all') return data;
    
    const now = new Date();
    const filterDate = new Date();
    
    switch(timeFilter) {
      case 'day':
        filterDate.setDate(now.getDate() - 1);
        break;
      case 'week':
        filterDate.setDate(now.getDate() - 7);
        break;
      case 'month':
        filterDate.setMonth(now.getMonth() - 1);
        break;
      default:
        return data;
    }
    
    return data.filter(item => new Date(item.date) >= filterDate);
  };

  const sortCourses = (courses) => {
    if (!courses) return [];
    
    return [...courses].sort((a, b) => {
      let comparison = 0;
      switch (sortBy) {
        case 'enrollments':
          comparison = b.enrollments - a.enrollments;
          break;
        case 'name':
          comparison = a.name.localeCompare(b.name);
          break;
        case 'rating':
          comparison = (b.rating || 0) - (a.rating || 0);
          break;
        case 'completion':
          comparison = (b.completionRate || 0) - (a.completionRate || 0);
          break;
        default:
          return 0;
      }
      return sortOrder === 'asc' ? comparison : -comparison;
    });
  };

  const metrics = dashboardData?.metrics || {
    totalCourses: 0,
    totalStudents: 0,
    averageRating: 0,
    completionRate: 0,
    studentGrowth: 0
  };

  // Component render
  return (
    <div className="instructor-dashboard">
      <Header username={currentUser?.username} role={currentUser?.role} onLogout={logout} />
      
      <div className="dashboard-content">
        <h1>Instructor Dashboard</h1>
        <p className="greeting">
          Welcome back, <span className="username">{currentUser?.username}</span> - here's your course performance overview.
        </p>

        {/* Metrics Grid */}
        <div className="metrics-grid">
          <MetricCard 
            title="Total Courses" 
            value={metrics.totalCourses}
          />
          <MetricCard 
            title="Total Students" 
            value={Math.round(metrics.totalStudents)}
          />
          <MetricCard 
            title="Average Rating" 
            value={`${metrics.averageRating.toFixed(1)} ★`}
          />
          <MetricCard 
            title="Completion Rate" 
            value={`${metrics.completionRate}%`}
          />
        </div>

        {/* Tabs Container */}
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
              Your Courses
            </button>
          </div>

          <div className="tab-content">
            {activeTab === 'statistics' && (
              <div className="statistics-tab">
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

                <div className="chart-container">
                  <StatisticsChart 
                    data={filterDataByTime(dashboardData?.enrollmentTrends)}
                    title="Enrollment Trends"
                    yAxisLabel="New Enrollments"
                    color="#4CAF50"
                  />
                </div>
              </div>
            )}

            {activeTab === 'courses' && (
              <div className="courses-tab">
                {(!dashboardData?.courses || dashboardData.courses.length === 0) ? (
                  <div className="no-data-message">
                    <p>You haven't created any courses yet.</p>
                  </div>
                ) : (
                  <>
                    <div className="courses-header">
                      <div className="course-controls">
                        <select 
                          value={sortBy} 
                          onChange={(e) => setSortBy(e.target.value)}
                        >
                          <option value="enrollments">Sort by Enrollments</option>
                          <option value="name">Sort by Name</option>
                          <option value="rating">Sort by Rating</option>
                          <option value="completion">Sort by Completion</option>
                        </select>
                        <button 
                          className="sort-order-btn"
                          onClick={() => setSortOrder(order => order === 'asc' ? 'desc' : 'asc')}
                        >
                          {sortOrder === 'asc' ? '↑' : '↓'}
                        </button>
                      </div>
                    </div>

                    <div className="courses-list">
                      {sortCourses(dashboardData.courses).map(course => (
                        <div key={course.id} className="course-card">
                          <div className="course-info">
                            <h3>{course.name}</h3>
                            <div className="course-stats">
                              <span>👥 {course.enrollments} students</span>
                              <span>⭐ {course.rating.toFixed(1)} rating</span>
                            </div>
                            <div className="progress-info">
                              <p>Completion Rate: {course.completionRate}%</p>
                              <ProgressBar percentage={course.completionRate} />
                            </div>
                          </div>
                          <div className="course-actions">
                            <Link to={`/manage-course/${course.id}`} className="instructor-view-course-btn">
                              Manage Course
                            </Link>
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
    </div>
  );
};

export default InstructorDashboard;
