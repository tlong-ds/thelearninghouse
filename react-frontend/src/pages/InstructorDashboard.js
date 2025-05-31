import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../services/AuthContext';
import { fetchInstructorDashboard } from '../services/api';
import '../styles/InstructorDashboard.css';

// Unified StatisticsChart component
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
    return <div className="instructor-no-data-message">No data available for this chart.</div>;
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
    <div className="instructor-statistics-chart">
      <h3>{title}</h3>
      <div className="instructor-chart-svg-container">
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
            <g key={i} className="instructor-data-point">
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
    </div>
  );
};

// Progress bar component - Updated for instructor dashboard
const ProgressBar = ({ percentage }) => {
  return (
    <div className="instructor-progress-container">
      <div 
        className="instructor-progress-bar" 
        style={{ width: `${percentage}%` }}
      >
      </div>
    </div>
  );
};

const InstructorDashboard = () => {
  const [dashboardData, setDashboardData] = useState(null);
  const [courseAnalytics, setCourseAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('statistics');
  const [timeFilter, setTimeFilter] = useState('all');
  const [sortBy, setSortBy] = useState('enrollments');
  const [sortOrder, setSortOrder] = useState('desc');
  const [selectedCourse, setSelectedCourse] = useState('all');
  const [isAnimating, setIsAnimating] = useState(false);

  const { currentUser, logout } = useAuth();
  const navigate = useNavigate();

  // Handle course card navigation
  const handleCourseClick = (courseId) => {
    navigate(`/manage-course/${courseId}`);
  };

  // Load course analytics when a course is selected
  const loadCourseAnalytics = async (courseId) => {
    if (courseId === 'all') {
      console.log('Setting courseAnalytics to null for "all" selection');
      setCourseAnalytics(null);
      return;
    }

    try {
      console.log('Loading analytics for course ID:', courseId);
      setAnalyticsLoading(true);
      const dashboardWithAnalytics = await fetchInstructorDashboard(courseId);
      console.log('Dashboard with analytics loaded successfully:', dashboardWithAnalytics);
      console.log('Course analytics in response:', dashboardWithAnalytics.courseAnalytics);
      
      if (dashboardWithAnalytics.courseAnalytics) {
        console.log('Setting courseAnalytics state with:', dashboardWithAnalytics.courseAnalytics);
        setCourseAnalytics(dashboardWithAnalytics.courseAnalytics);
      } else {
        console.warn('No course analytics found in dashboard response');
        setCourseAnalytics(null);
      }
    } catch (err) {
      console.error('Failed to load course analytics:', err);
      console.error('Error details:', err.response?.data || err.message);
      // Show error to user
      setError(`Failed to load analytics for course ${courseId}: ${err.response?.data?.detail || err.message}`);
    } finally {
      setAnalyticsLoading(false);
    }
  };

  // Handle course selection change
  const handleCourseSelectionChange = (courseId) => {
    console.log('Selected course ID:', courseId, 'Type:', typeof courseId);
    setSelectedCourse(courseId);
    loadCourseAnalytics(courseId);
  };

  useEffect(() => {
    // Redirect if not an instructor
    if (currentUser && currentUser.role !== 'Instructor') {
      navigate('/');
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

  // Log available courses and IDs
  useEffect(() => {
    if (dashboardData?.courses) {
      console.log('Available courses:', dashboardData.courses);
      console.log('Course IDs:', dashboardData.courses.map(c => c.id));
    }
  }, [dashboardData]);

  // Format data for charts
  const filterDataByTime = (data) => {
    if (!data) return [];
    
    // Apply time filtering regardless of data source
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

  // Get chart data based on selected course
  const getChartData = () => {
    console.log('getChartData called:', {
      selectedCourse,
      courseAnalytics: !!courseAnalytics,
      courseAnalyticsData: courseAnalytics,
      dashboardEnrollmentTrends: dashboardData?.enrollmentTrends?.length || 0
    });
    
    if (selectedCourse !== 'all' && courseAnalytics) {
      console.log('Using course-specific analytics data');
      return {
        enrollmentTrends: filterDataByTime(courseAnalytics.enrollmentTrends),
        ratingTrends: filterDataByTime(courseAnalytics.ratingTrends),
        completionTrends: filterDataByTime(courseAnalytics.completionTrends)
      };
    }
    console.log('Using general dashboard data');
    return {
      enrollmentTrends: filterDataByTime(dashboardData?.enrollmentTrends),
      ratingTrends: filterDataByTime(dashboardData?.ratingTrends),
      completionTrends: []
    };
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
  if (loading) {
    return (
      <div className="instructor-dashboard">
        <div className="instructor-dashboard-content">
          <div className="instructor-loading">Loading dashboard data...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="instructor-dashboard">
        <div className="instructor-dashboard-content">
          <div className="instructor-error">{error}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="instructor-dashboard">
      <div className="instructor-dashboard-content">
        <h1 className="instructor-h1">Instructor Dashboard</h1>
        <p className="instructor-greeting">
          Welcome back, <span className="instructor-username">{currentUser?.username}</span> - here's your course performance overview.
        </p>

        {/* Metrics Grid */}
        <div className="instructor-metrics-container">
          <div className="instructor-metric-card">
            <h3>Total Courses</h3>
            <div className="instructor-metric-value">{metrics.totalCourses}</div>
          </div>
          
          <div className="instructor-metric-card">
            <h3>Total Students</h3>
            <div className="instructor-metric-value">{Math.round(metrics.totalStudents)}</div>
          </div>
          
          <div className="instructor-metric-card">
            <h3>Average Rating</h3>
            <div className="instructor-metric-value">{`${metrics.averageRating.toFixed(1)} ★`}</div>
          </div>
          
          <div className="instructor-metric-card">
            <h3>Completion Rate</h3>
            <div className="instructor-metric-value">{`${metrics.completionRate}%`}</div>
          </div>
        </div>

        {/* Tabs Container */}
        <div className="instructor-tabs-container">
          <div className="instructor-tabs">
            <button 
              className={`instructor-tab ${activeTab === 'statistics' ? 'active' : ''}`}
              onClick={() => setActiveTab('statistics')}
            >
              Statistics
            </button>
            <button 
              className={`instructor-tab ${activeTab === 'courses' ? 'active' : ''}`}
              onClick={() => setActiveTab('courses')}
            >
              Your Courses
            </button>
          </div>

          <div className="instructor-tab-content">
            {activeTab === 'statistics' && (
              <div className="instructor-statistics-tab">
                <div className="instructor-statistics-controls">
                  <div className="instructor-filters-row">
                    <div className="instructor-course-filter-controls">
                      <span>Course:</span>
                      <select
                        className="instructor-course-select"
                        value={selectedCourse}
                        onChange={(e) => handleCourseSelectionChange(
                          e.target.value === 'all'
                            ? 'all'
                            : Number(e.target.value)
                        )}
                        disabled={loading || analyticsLoading}
                      >
                        <option value="all">All Courses</option>
                        {dashboardData?.courses?.map(course => (
                          <option key={course.id} value={course.id}>
                            {course.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    
                    <div className="instructor-time-filter-controls">
                      <span>Time Range:</span>
                      <button 
                        className={`instructor-time-filter-btn ${timeFilter === 'all' ? 'active' : ''}`}
                        onClick={() => {
                          setIsAnimating(true);
                          setTimeFilter('all');
                          setTimeout(() => setIsAnimating(false), 500);
                        }}
                        disabled={loading}
                      >
                        All Time
                      </button>
                      <button 
                        className={`instructor-time-filter-btn ${timeFilter === 'month' ? 'active' : ''}`}
                        onClick={() => {
                          setIsAnimating(true);
                          setTimeFilter('month');
                          setTimeout(() => setIsAnimating(false), 500);
                        }}
                        disabled={loading}
                      >
                        Last Month
                      </button>
                      <button 
                        className={`instructor-time-filter-btn ${timeFilter === 'week' ? 'active' : ''}`}
                        onClick={() => {
                          setIsAnimating(true);
                          setTimeFilter('week');
                          setTimeout(() => setIsAnimating(false), 500);
                        }}
                        disabled={loading}
                      >
                        Last Week
                      </button>
                      <button 
                        className={`instructor-time-filter-btn ${timeFilter === 'day' ? 'active' : ''}`}
                        onClick={() => {
                          setIsAnimating(true);
                          setTimeFilter('day');
                          setTimeout(() => setIsAnimating(false), 500);
                        }}
                        disabled={loading}
                      >
                        Last 24 Hours
                      </button>
                    </div>
                  </div>

                  {analyticsLoading && (
                    <div className="instructor-analytics-loading">
                      Loading course analytics...
                    </div>
                  )}

                  <div className="instructor-chart-container">
                    {selectedCourse === 'all' ? (
                      <StatisticsChart 
                        data={getChartData().enrollmentTrends}
                        title="Enrollment Trends"
                        yAxisLabel="New Enrollments"
                        color="#4CAF50"
                      />
                    ) : (
                      <div className="instructor-course-analytics">
                        <div className="instructor-analytics-grid">
                          <div className="instructor-analytics-chart">
                            <StatisticsChart 
                              data={getChartData().enrollmentTrends}
                              title="Course Enrollment Trends"
                              yAxisLabel="New Enrollments"
                              color="#4CAF50"
                            />
                          </div>
                          
                          {courseAnalytics?.ratingTrends?.length > 0 && (
                            <div className="instructor-analytics-chart">
                              <StatisticsChart 
                                data={getChartData().ratingTrends}
                                title="Rating Trends"
                                yAxisLabel="Average Rating"
                                color="#FF9800"
                              />
                            </div>
                          )}
                          
                          {courseAnalytics?.completionTrends?.length > 0 && (
                            <div className="instructor-analytics-chart">
                              <StatisticsChart 
                                data={getChartData().completionTrends}
                                title="Completion Rate Trends"
                                yAxisLabel="Completion Rate (%)"
                                color="#2196F3"
                              />
                            </div>
                          )}
                        </div>

                        {courseAnalytics && (
                          <div className="instructor-course-details">
                            <h3>Course Analytics: {courseAnalytics.courseName}</h3>
                            
                            <div className="instructor-analytics-metrics">
                              <div className="instructor-analytics-metric">
                                <span className="instructor-metric-label">Total Enrollments:</span>
                                <span className="instructor-metric-value">{courseAnalytics.totalEnrollments}</span>
                              </div>
                              <div className="instructor-analytics-metric">
                                <span className="instructor-metric-label">Completion Rate:</span>
                                <span className="instructor-metric-value">{courseAnalytics.completionRate}%</span>
                              </div>
                              <div className="instructor-analytics-metric">
                                <span className="instructor-metric-label">Average Rating:</span>
                                <span className="instructor-metric-value">{courseAnalytics.averageRating} ⭐</span>
                              </div>
                            </div>

                            {courseAnalytics.studentProgress?.length > 0 && (
                              <div className="instructor-progress-distribution">
                                <h4>Student Progress Distribution</h4>
                                <div className="instructor-progress-bars">
                                  {courseAnalytics.studentProgress.map((progress, index) => (
                                    <div key={index} className="instructor-progress-item">
                                      <span className="instructor-progress-label">{progress.range}</span>
                                      <div className="instructor-progress-bar-container">
                                        <div 
                                          className="instructor-progress-bar-fill"
                                          style={{ 
                                            width: `${(progress.count / courseAnalytics.totalEnrollments * 100)}%`,
                                            backgroundColor: `hsl(${120 - index * 20}, 70%, 50%)`
                                          }}
                                        ></div>
                                        <span className="instructor-progress-count desktop-only">{progress.count}</span>
                                      </div>
                                      <span className="instructor-progress-count mobile-only">{progress.count}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {courseAnalytics.lectureAnalytics?.length > 0 && (
                              <div className="instructor-lecture-analytics">
                                <h4>Lecture Performance</h4>
                                <div className="instructor-lecture-list">
                                  {courseAnalytics.lectureAnalytics.map((lecture, index) => (
                                    <div key={index} className="instructor-lecture-item">
                                      <div className="instructor-lecture-info">
                                        <h5>{lecture.title}</h5>
                                        <div className="instructor-lecture-stats">
                                          <span>Attempts: {lecture.totalAttempts}</span>
                                          <span>Pass Rate: {lecture.passRate}%</span>
                                          <span>Avg Score: {lecture.averageScore}</span>
                                        </div>
                                      </div>
                                      <div className="instructor-lecture-progress">
                                        <ProgressBar percentage={lecture.passRate} />
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'courses' && (
              <div className="instructor-courses-tab">
                {(!dashboardData?.courses || dashboardData.courses.length === 0) ? (
                  <div className="instructor-no-data-message">
                    <p>You haven't created any courses yet.</p>
                  </div>
                ) : (
                  <>
                    <div className="instructor-course-controls">
                      <select 
                        value={sortBy} 
                        onChange={(e) => setSortBy(e.target.value)}
                      >
                        <option value="enrollments">Enrollments</option>
                        <option value="name">Name</option>
                        <option value="rating">Rating</option>
                        <option value="completion">Completion</option>
                      </select>
                      <button 
                        className="instructor-sort-order-btn"
                        onClick={() => setSortOrder(order => order === 'asc' ? 'desc' : 'asc')}
                      >
                        {sortOrder === 'asc' ? '↑' : '↓'}
                      </button>
                    </div>

                    <div className="instructor-courses-list">
                      {sortCourses(dashboardData.courses).map(course => (
                        <div 
                          key={course.id} 
                          className="instructor-course-card"
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
                          <div className="instructor-course-info">
                            <h3>{course.name}</h3>
                            <div className="instructor-course-meta">
                              <span className={`instructor-course-status ${course.status || 'published'}`}>
                                {course.status || 'Published'}
                              </span>
                            </div>
                            <div className="instructor-course-stats">
                              <div className="instructor-stat-item">
                                <span className="instructor-stat-icon">👥</span>
                                <span>{course.enrollments} students</span>
                              </div>
                              <div className="instructor-stat-item">
                                <span className="instructor-stat-icon">⭐</span>
                                <span>{course.rating.toFixed(1)} rating</span>
                              </div>
                            </div>
                            <div className="instructor-progress-info">
                              <p>Completion Rate</p>
                              <ProgressBar percentage={course.completionRate} />
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
    </div>
  );
};

export default InstructorDashboard;
