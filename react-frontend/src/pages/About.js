import React, { useState, useEffect } from 'react';
import { Container as BootstrapContainer, Card, Row, Col, Table } from 'react-bootstrap';
import { useAuth } from '../services/AuthContext';
import Header from '../components/Header';
import axios from 'axios';
import config from '../config';
import '../styles/About.css';
import { images } from '../utils/images';
import { useNavigate } from 'react-router-dom';

// Create axios instance with config URL
const apiClient = axios.create({
    baseURL: config.API_URL,
    withCredentials: true
});

const About = () => {
    const { currentUser, logout } = useAuth();
    const navigate = useNavigate();

    // Add handleLogout function
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

    useEffect(() => {
        const fetchMetrics = async () => {
            try {
                const [coursesRes, learnersRes, instructorsRes] = await Promise.all([
                    apiClient.get('/api/courses'),
                    apiClient.get('/api/statistics/users/count', { params: { role: 'Learner' }}),
                    apiClient.get('/api/statistics/users/count', { params: { role: 'Instructor' }})
                ]);

                setMetrics({
                    totalCourses: coursesRes.data.length,
                    totalLearners: learnersRes.data.count,
                    totalInstructors: instructorsRes.data.count
                });
            } catch (error) {
                console.error('Error fetching metrics:', error);
                // Keep the default values (all zeros) if the API calls fail
            }
        };
        fetchMetrics();
    }, []);

    const team = [
        { name: "Doan Quoc Bao", role: "Backend Developer", image: images.ava1 },
        { name: "Ly Thanh Long", role: "Frontend Developer", image: images.ava2 },
        { name: "Tran Anh Tuan", role: "Data Engineer", image: images.ava3 },
        { name: "Ha Quang Minh", role: "UI/UX Designer", image: images.ava4 }
    ];

    return (
        <div className="about-container">
            <Header 
                username={currentUser?.username} 
                role={currentUser?.role} 
                onLogout={handleLogout} // Update this
            />
            <BootstrapContainer>
                <h1 className="text-center mb-4">About The Learning House</h1>
                
                <p className="lead text-center">
                    Welcome to <strong>The Learning House</strong>, the home of <strong>Learning Connect</strong> —
                    a comprehensive marketplace uniting passionate learners with expert instructors across all domains.
                </p>

                {/* Metrics */}
                <Row className="metrics-row mb-5">
                    <Col md={4}>
                        <Card className="metric-card">
                            <Card.Body className="text-center">
                                <h2>📚 {metrics.totalCourses}</h2>
                                <p>Courses</p>
                            </Card.Body>
                        </Card>
                    </Col>
                    <Col md={4}>
                        <Card className="metric-card">
                            <Card.Body className="text-center">
                                <h2>👩‍🎓 {metrics.totalLearners}</h2>
                                <p>Learners</p>
                            </Card.Body>
                        </Card>
                    </Col>
                    <Col md={4}>
                        <Card className="metric-card">
                            <Card.Body className="text-center">
                                <h2>👩‍🏫 {metrics.totalInstructors}</h2>
                                <p>Instructors</p>
                            </Card.Body>
                        </Card>
                    </Col>
                </Row>

                {/* Problem Statement */}
                <section className="mb-5">
                    <h2>Problem Statement</h2>
                    <p>Learners today crave diverse, high-quality content spanning from soft skills to academic subjects. Yet existing platforms fall short.</p>
                    <p className="mb-2"><strong>YouTube</strong> lacks structured curricula, clear learning paths, and interactive support.</p>
                    <p className="mb-2"><strong>Traditional e-learning sites</strong> often restrict content to specific grades or fields.</p>
                    <p className="mb-2"><strong>Instructors struggle</strong> to publish, monetize, and reach eager audiences due to opaque onboarding.</p>
                </section>

                {/* Our Solution */}
                <section className="mb-5">
                    <h2>Our Solution: The Learning House</h2>
                    <p><strong>The Learning House</strong> is a unified education marketplace designed to be:</p>
                    <p className="mb-2"><strong>Easy to learn:</strong> Micro-learning videos, clear skill tracks, badges & certificates</p>
                    <p className="mb-2"><strong>Easy to teach:</strong> One-click course builder, standardized templates</p>
                    <p className="mb-2"><strong>Unlimited content:</strong> From personal development to advanced technical subjects</p>
                    <p className="mb-2"><strong>Community-driven:</strong> Live Q&A, livestreaming, mentorship, and workshops</p>
                </section>

                {/* Key Features */}
                <section className="mb-5">
                    <h2>Key Features</h2>
                    <Table responsive>
                        <thead>
                            <tr>
                                <th>User Type</th>
                                <th>Features</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td><strong>Learners</strong></td>
                                <td>
                                    • Personalized dashboard: progress, skill badges<br />
                                    • AI-powered course recommender<br />
                                    • Interactive Q&A, quizzes, hands-on projects<br />
                                    • Gamification: leaderboards & rewards
                                </td>
                            </tr>
                            <tr>
                                <td><strong>Instructors</strong></td>
                                <td>
                                    • One-click course creation: video, slides, quizzes, live-stream<br />
                                    • Detailed analytics: engagement, completion rates<br />
                                    • Seamless marketplace integration & promotional tools<br />
                                    • Flexible monetization options
                                </td>
                            </tr>
                        </tbody>
                    </Table>
                </section>

                {/* Competitive Advantage */}
                <section className="mb-5">
                    <h2>Competitive Advantage</h2>
                    <p className="mb-2"><strong>Structured Learning:</strong> Combined modules, assessments, and certificates</p>
                    <p className="mb-2"><strong>Open Platform:</strong> Anyone from life coaches to data scientists can share expertise</p>
                    <p className="mb-2"><strong>Smart Technology:</strong> AI-driven subtitles, summarization, and personalized paths</p>
                    <p className="mb-2"><strong>Community & Support:</strong> Mentor matching, peer reviews, instructor workshops</p>
                </section>

                {/* Roadmap & Vision */}
                <section className="mb-5">
                    <h2>Roadmap & Vision</h2>
                    <div className="roadmap">
                        <h3>Phase 1 (MVP)</h3>
                        <p className="mb-2">Core marketplace: course listing, enrollment, secure payments</p>
                        <p className="mb-2">Foundational UX for web & mobile</p>

                        <h3>Phase 2</h3>
                        <p className="mb-2">AI-driven recommendations & auto-transcripts</p>
                        <p className="mb-2">Advanced analytics & community forums</p>

                        <h3>Phase 3</h3>
                        <p className="mb-2">B2B white-label offerings for organizations & schools</p>
                        <p className="mb-2">Multi-language expansion targeting APAC and global markets</p>

                        <p className="vision">
                            <strong>Long-term Vision:</strong> Transform Learning Connect into the world's most 
                            learner-centric, community-driven, and innovation-led educational ecosystem.
                        </p>
                    </div>
                </section>

                {/* Team Section */}
                <section className="mb-5">
                    <h2 className="text-center">Meet Our Specialists</h2>
                    <Row className="team-section">
                        {team.map((member, index) => (
                            <Col md={3} key={index} className="text-center mb-4">
                                <div className="team-member">
                                    <img src={member.image} alt={member.name} className="team-photo" />
                                    <h3>{member.name}</h3>
                                    <p>{member.role}</p>
                                </div>
                            </Col>
                        ))}
                    </Row>
                </section>

                {/* Contact Section */}
                <section className="contact-section text-center mb-5">
                    <h2>Get In Touch</h2>
                    <p>
                        <a href="mailto:support@learninghouse.com">📧 support@learninghouse.com</a><br />
                        <a href="https://www.learninghouse.com">🌐 www.learninghouse.com</a><br />
                        📞 +84 888 888 888
                    </p>
                </section>

                <footer className="text-center text-muted">
                    <small>© 2025 The Learning House. All rights reserved.</small>
                </footer>
            </BootstrapContainer>
        </div>
    );
};

export default About;
