import React from 'react';
import { Navbar, Nav, Container, Dropdown } from 'react-bootstrap';
import { useNavigate, useLocation } from 'react-router-dom';
import '../styles/Header.css';

const Header = ({ username, role, onLogout }) => {
  const navigate = useNavigate();
  const location = useLocation();

  const handleNavigation = (path) => {
    navigate(path);
  };

  const handleLogout = () => {
    onLogout();
    navigate('/login');
  };

  const getActiveClass = (path) => {
    return location.pathname === path ? 'active' : '';
  };

  return (
    <header className="static-header">
      <Navbar bg="light" expand="lg" className="border-bottom">
        <Container fluid>
          <Navbar.Brand 
            onClick={() => handleNavigation('/')} 
            className="d-flex align-items-center cursor-pointer"
          >
            <img
              src="/thelearninghouse/assets/light_logo.webp"
              width="40"
              height="40"
              className="d-inline-block align-top me-2"
              alt="The Learning House"
            />
            <span className="fw-bold text-primary">The Learning House</span>
          </Navbar.Brand>

          <Navbar.Toggle aria-controls="basic-navbar-nav" />
          
          <Navbar.Collapse id="basic-navbar-nav">
            <Nav className="me-auto">
              <Nav.Link 
                onClick={() => handleNavigation('/dashboard')}
                className={getActiveClass('/dashboard')}
              >
                Dashboard
              </Nav.Link>
              
              <Nav.Link 
                onClick={() => handleNavigation('/courses')}
                className={getActiveClass('/courses')}
              >
                Courses
              </Nav.Link>
              
              <Nav.Link 
                onClick={() => handleNavigation('/edumate')}
                className={getActiveClass('/edumate')}
              >
                Edumate AI
              </Nav.Link>

              {role === 'Instructor' && (
                <Nav.Link 
                  onClick={() => handleNavigation('/instructor/dashboard')}
                  className={getActiveClass('/instructor/dashboard')}
                >
                  Instructor
                </Nav.Link>
              )}
            </Nav>

            <Nav className="ms-auto">
              <Dropdown align="end">
                <Dropdown.Toggle 
                  variant="outline-primary" 
                  id="dropdown-user"
                  className="d-flex align-items-center"
                >
                  <i className="bi bi-person-circle me-2"></i>
                  {username}
                </Dropdown.Toggle>

                <Dropdown.Menu>
                  <Dropdown.Item onClick={() => handleNavigation('/settings')}>
                    <i className="bi bi-gear me-2"></i>
                    Settings
                  </Dropdown.Item>
                  
                  <Dropdown.Divider />
                  
                  <Dropdown.Item onClick={handleLogout} className="text-danger">
                    <i className="bi bi-box-arrow-right me-2"></i>
                    Logout
                  </Dropdown.Item>
                </Dropdown.Menu>
              </Dropdown>
            </Nav>
          </Navbar.Collapse>
        </Container>
      </Navbar>
    </header>
  );
};

export default Header;
