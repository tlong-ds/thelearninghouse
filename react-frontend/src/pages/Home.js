import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../services/AuthContext';
import axios from 'axios';
import config from '../config';
import '../styles/Home.css';
import { images } from '../utils/images';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion'; // You'll need to install this: npm install framer-motion
import gradientVideo from '../assets/videos/gradient-bg.mp4';

// Create axios instance with config URL
const apiClient = axios.create({
    baseURL: config.API_URL,
    withCredentials: true
});

// Cache configuration
const CACHE_CONFIG = {
    METRICS_KEY: 'about_metrics_cache',
    TTL: 5 * 60 * 1000 // 5 minutes in milliseconds
};

// Cache utility functions - keeping these unchanged
const getCachedData = (key) => {
    try {
        const cached = localStorage.getItem(key);
        if (!cached) return null;
        
        const { data, timestamp } = JSON.parse(cached);
        const now = Date.now();
        
        // Check if cache is still valid
        if (now - timestamp < CACHE_CONFIG.TTL) {
            return data;
        }
        
        // Cache expired, remove it
        localStorage.removeItem(key);
        return null;
    } catch (error) {
        console.error('Error reading from cache:', error);
        localStorage.removeItem(key);
        return null;
    }
};

const setCachedData = (key, data) => {
    try {
        const cacheEntry = {
            data,
            timestamp: Date.now()
        };
        localStorage.setItem(key, JSON.stringify(cacheEntry));
    } catch (error) {
        console.error('Error writing to cache:', error);
    }
};

// Animation variants
const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
        opacity: 1,
        transition: {
            staggerChildren: 0.1,
            delayChildren: 0.2
        }
    }
};

const itemVariants = {
    hidden: { y: 20, opacity: 0 },
    visible: {
        y: 0,
        opacity: 1,
        transition: { type: 'spring', stiffness: 100, damping: 15 }
    }
};

const Home = () => {
    const { currentUser, logout } = useAuth();
    const navigate = useNavigate();

    // Handle logout function - keeping it unchanged
    const handleLogout = async () => {
        try {
            await logout();
            navigate('/login');
        } catch (error) {
            console.error('Logout failed:', error);
            navigate('/login');
        }
    };

    const [metrics, setMetrics] = useState({
        totalCourses: 0,
        totalLearners: 0,
        totalInstructors: 0
    });
    const [metricsLoading, setMetricsLoading] = useState(true);

    // Memoized function to fetch metrics with caching - keeping logic unchanged
    const fetchMetrics = useCallback(async () => {
        try {
            // Check cache first
            const cachedMetrics = getCachedData(CACHE_CONFIG.METRICS_KEY);
            if (cachedMetrics) {
                setMetrics(cachedMetrics);
                setMetricsLoading(false);
                return;
            }

            setMetricsLoading(true);
            
            // Fetch from API if not cached
            const [coursesRes, learnersRes, instructorsRes] = await Promise.all([
                apiClient.get('/api/courses'),
                apiClient.get('/api/statistics/users/count', { params: { role: 'Learner' }}),
                apiClient.get('/api/statistics/users/count', { params: { role: 'Instructor' }})
            ]);

            const newMetrics = {
                totalCourses: coursesRes.data.length,
                totalLearners: learnersRes.data.count,
                totalInstructors: instructorsRes.data.count
            };

            // Update state and cache
            setMetrics(newMetrics);
            setCachedData(CACHE_CONFIG.METRICS_KEY, newMetrics);
            
        } catch (error) {
            console.error('Error fetching metrics:', error);
            // Keep the default values (all zeros) if the API calls fail
        } finally {
            setMetricsLoading(false);
        }
    }, []);

    // Function to force refresh metrics (bypass cache) - keeping unchanged
    const refreshMetrics = useCallback(async () => {
        localStorage.removeItem(CACHE_CONFIG.METRICS_KEY);
        await fetchMetrics();
    }, [fetchMetrics]);

    useEffect(() => {
        fetchMetrics();
        document.title = 'The Learning House | Home';
    }, [fetchMetrics]);

    const team = [
        { name: "Doan Quoc Bao", role: "Backend Developer", image: images.ava1 },
        { name: "Ly Thanh Long", role: "Frontend Developer", image: images.ava2 },
        { name: "Tran Anh Tuan", role: "Data Engineer", image: images.ava3 },
        { name: "Ha Quang Minh", role: "UI/UX Designer", image: images.ava4 }
    ];

    const features = [
        {
            icon: "fas fa-brain",
            title: "AI-Powered Learning",
            description: "Personalized assistance that adapts to your learning style and needs."
        },
        {
            icon: "fas fa-book",
            title: "Interactive Lectures",
            description: "Engage with content through dynamic, interactive lecture experiences."
        },
        {
            icon: "fas fa-users",
            title: "Collaborative Learning",
            description: "Connect with peers and instructors in a seamless learning environment."
        }
    ];

    return (
        <div className="macos-container">
            <div className="macos-blur-background">
                <div className="macos-gradient-overlay"></div>
            </div>
            
            <motion.main 
                className="macos-main"
                initial="hidden"
                animate="visible"
                variants={containerVariants}
            >
                {/* Hero Section */}
                <motion.section className="macos-hero" variants={itemVariants}>
                    {/* Video Background */}
                    <div className="macos-hero-video-container">
                        <div className="macos-hero-overlay"></div>
                        <video
                            className="macos-hero-video"
                            autoPlay
                            loop
                            muted
                            playsInline
                            src={gradientVideo}
                        >
                            {/* Fallback for browsers that don't support video */}
                        </video>
                    </div>
                    <h1>{currentUser ? `Welcome, ${currentUser.full_name}!` : 'The Learning House'}</h1>
                    <p className="macos-subtitle">A comprehensive marketplace uniting passionate learners with expert instructors</p>
                    
                    <div className="macos-cta-container">
                        {currentUser ? (
                            <>
                                <Link to="/courses" className="macos-cta-primary">
                                    Explore Courses
                                </Link>
                                <Link to="/edumate" className="macos-cta-secondary">
                                    Try Edumate AI
                                </Link>
                            </>
                        ) : (
                            <>
                                <Link to="/login" className="macos-cta-primary">
                                    Explore Courses
                                </Link>
                                <Link to="/login" className="macos-cta-secondary">
                                    Try Edumate AI
                                </Link>
                            </>
                        )}
                    </div>
                </motion.section>
                
                {/* Metrics Section */}
                <motion.section className="macos-metrics" variants={itemVariants}>
                    <h2>Our Impact</h2>
                    <div className="macos-metrics-grid">
                        <div className="macos-metric-item">
                            <h3>{metricsLoading ? '...' : metrics.totalCourses}</h3>
                            <p>Courses</p>
                        </div>
                        <div className="macos-metric-item">
                            <h3>{metricsLoading ? '...' : metrics.totalLearners}</h3>
                            <p>Learners</p>
                        </div>
                        <div className="macos-metric-item">
                            <h3>{metricsLoading ? '...' : metrics.totalInstructors}</h3>
                            <p>Instructors</p>
                        </div>
                    </div>
                </motion.section>
                
                {/* Features Section */}
                <motion.section className="macos-features" variants={itemVariants}>
                    <h2>Reimagine Your Learning Experience</h2>
                    
                    <div className="macos-cards">
                        {features.map((feature, index) => (
                            <motion.div 
                                key={index}
                                className="macos-card"
                                whileHover={{ y: -5, transition: { duration: 0.2 } }}
                            >
                                <div className="macos-card-icon">
                                    <i className={feature.icon}></i>
                                </div>
                                <h3>{feature.title}</h3>
                                <p>{feature.description}</p>
                            </motion.div>
                        ))}
                    </div>
                </motion.section>
                
                {/* Testimonial Section */}
                <motion.section className="macos-testimonial" variants={itemVariants}>
                    <div className="macos-testimonial-content">
                        <blockquote>
                            "The Learning House transformed how I approach education. The AI assistant helped me understand complex topics I was struggling with for months."
                        </blockquote>
                        <cite>— Sarah K., Computer Science Student</cite>
                    </div>
                </motion.section>
                
                {/* Roadmap Section */}
                <motion.section className="macos-roadmap" variants={itemVariants}>
                    <h2>Our Roadmap</h2>
                    
                    <div className="macos-roadmap-timeline">
                        <div className="macos-roadmap-item">
                            <div className="macos-roadmap-marker">1</div>
                            <div className="macos-roadmap-content">
                                <h3>Phase 1 (MVP)</h3>
                                <p>Core marketplace: course listing, enrollment, secure payments</p>
                                <p>Foundational UX for web & mobile</p>
                            </div>
                        </div>
                        
                        <div className="macos-roadmap-item">
                            <div className="macos-roadmap-marker">2</div>
                            <div className="macos-roadmap-content">
                                <h3>Phase 2</h3>
                                <p>AI-driven recommendations & auto-transcripts</p>
                                <p>Advanced analytics & community forums</p>
                            </div>
                        </div>
                        
                        <div className="macos-roadmap-item">
                            <div className="macos-roadmap-marker">3</div>
                            <div className="macos-roadmap-content">
                                <h3>Phase 3</h3>
                                <p>B2B white-label offerings for organizations & schools</p>
                                <p>Multi-language expansion targeting global markets</p>
                            </div>
                        </div>
                    </div>
                </motion.section>
                
                {/* Team Section */}
                <motion.section className="macos-team" variants={itemVariants}>
                    <h2>Meet Our Team</h2>
                    
                    <div className="macos-team-grid">
                        {team.map((member, index) => (
                            <motion.div 
                                key={index}
                                className="macos-team-member"
                                whileHover={{ scale: 1.03, transition: { duration: 0.2 } }}
                            >
                                <div className="macos-team-photo-container">
                                    <img src={member.image} alt={member.name} className="macos-team-photo" />
                                </div>
                                <h3>{member.name}</h3>
                                <p>{member.role}</p>
                            </motion.div>
                        ))}
                    </div>
                </motion.section>
                
                {/* Contact Section */}
                <motion.section className="macos-contact" variants={itemVariants}>
                    <h2>Get In Touch</h2>
                    <div className="macos-contact-methods">
                        <a href="mailto:support@learninghouse.com" className="macos-contact-item">
                            <i className="fas fa-envelope"></i>
                            <span>support@learninghouse.com</span>
                        </a>
                        <a href="https://www.learninghouse.com" className="macos-contact-item">
                            <i className="fas fa-globe"></i>
                            <span>www.learninghouse.com</span>
                        </a>
                        <a href="tel:+84888888888" className="macos-contact-item">
                            <i className="fas fa-phone"></i>
                            <span>+84 888 888 888</span>
                        </a>
                    </div>
                </motion.section>
            </motion.main>
        </div>
    );
};

export default Home;