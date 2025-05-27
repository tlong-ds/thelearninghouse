use onlinelearning;

-- Clean up existing data
DROP TABLE IF EXISTS LectureResults;
DROP TABLE IF EXISTS Notebooks;
DROP TABLE IF EXISTS Lectures;
DROP TABLE IF EXISTS Enrollments;
DROP TABLE IF EXISTS Learners;
DROP TABLE IF EXISTS Courses;
DROP TABLE IF EXISTS Instructors;

-- 1. Learners
CREATE TABLE Learners (
  LearnerID     INT            AUTO_INCREMENT PRIMARY KEY,
  LearnerName   VARCHAR(50)    NOT NULL,
  Email         VARCHAR(50)    NOT NULL UNIQUE,
  AccountName   VARCHAR(50)    NOT NULL UNIQUE,
  Password      VARCHAR(200)   NOT NULL,
  PhoneNumber   VARCHAR(15),
  CreatedAt     TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UpdatedAt     TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- 2. Instructors
CREATE TABLE Instructors (
  InstructorID   INT            AUTO_INCREMENT PRIMARY KEY,
  InstructorName VARCHAR(50)    NOT NULL,
  Expertise      VARCHAR(100),
  Email          VARCHAR(50)    NOT NULL UNIQUE,
  AccountName    VARCHAR(50)    NOT NULL UNIQUE,
  Password       VARCHAR(200)   NOT NULL,
  CreatedAt      TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UpdatedAt      TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- 3. Courses
CREATE TABLE Courses (
  CourseID        INT                             AUTO_INCREMENT PRIMARY KEY,
  CourseName      VARCHAR(100)                    NOT NULL,
  Descriptions    TEXT,
  Skills          TEXT                            NOT NULL,
  EstimatedDuration INT                           NOT NULL COMMENT 'giờ',
  Difficulty      ENUM('Beginner','Intermediate','Advanced','Expert') NOT NULL DEFAULT 'Beginner',
  AverageRating   DECIMAL(3,2)                    NOT NULL DEFAULT 0.00,
  InstructorID    INT,
  CreatedAt       TIMESTAMP                       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UpdatedAt       TIMESTAMP                       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (InstructorID) REFERENCES Instructors(InstructorID)
);

-- 4. Lectures
CREATE TABLE Lectures (
  LectureID  INT            AUTO_INCREMENT PRIMARY KEY,
  Title      VARCHAR(100)   NOT NULL,
  Description TEXT,
  Content    TEXT,
  CourseID   INT            NOT NULL,
  CreatedAt  TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UpdatedAt  TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (CourseID) REFERENCES Courses(CourseID)
);

-- 5. Enrollments
CREATE TABLE Enrollments (
  EnrollmentID   INT       AUTO_INCREMENT PRIMARY KEY,
  EnrollmentDate DATE      NOT NULL,
  LearnerID      INT       NOT NULL,
  CourseID       INT       NOT NULL,
  Percentage INT,
  Rating     INT,
  UNIQUE KEY UX_Enrollments_Learner_Course (LearnerID, CourseID),
  FOREIGN KEY (LearnerID) REFERENCES Learners(LearnerID),
  FOREIGN KEY (CourseID)  REFERENCES Courses(CourseID)
);

-- 6. LectureResults
CREATE TABLE LectureResults (
  LearnerID  INT            NOT NULL,
  CourseID   INT            NOT NULL,
  LectureID  INT            NOT NULL,
  Score      INT,
  Date       DATE,
  State      VARCHAR(50)    NOT NULL,
  PRIMARY KEY (LearnerID, CourseID, LectureID),
  FOREIGN KEY (LearnerID)  REFERENCES Learners(LearnerID),
  FOREIGN KEY (CourseID)   REFERENCES Courses(CourseID),
  FOREIGN KEY (LectureID)  REFERENCES Lectures(LectureID)
);

-- 7. Notebooks
CREATE TABLE Notebooks (
  NotebookID   INT            AUTO_INCREMENT PRIMARY KEY,
  LearnerID    INT            NOT NULL,
  CourseID     INT,
  LectureID    INT,
  NotebookName VARCHAR(100)   UNIQUE,
  Content      VARCHAR(1000),
  CreatedDate  DATE,
  FOREIGN KEY (LearnerID) REFERENCES Learners(LearnerID),
  FOREIGN KEY (CourseID)   REFERENCES Courses(CourseID),
  FOREIGN KEY (LectureID)  REFERENCES Lectures(LectureID)
);

CREATE TABLE Quizzes (
    QuizID INT AUTO_INCREMENT PRIMARY KEY,
    LectureID INT,
    Title VARCHAR(255) NOT NULL,
    Description TEXT,
    CreatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (LectureID) REFERENCES Lectures(LectureID) ON DELETE CASCADE
);


CREATE TABLE Questions (
    QuestionID INT AUTO_INCREMENT PRIMARY KEY,
    QuizID INT,
    QuestionText TEXT NOT NULL,
    FOREIGN KEY (QuizID) REFERENCES Quizzes(QuizID) ON DELETE CASCADE
);

CREATE TABLE Options (
    OptionID INT AUTO_INCREMENT PRIMARY KEY,
    QuestionID INT,
    OptionText VARCHAR(255) NOT NULL,
    IsCorrect BOOLEAN DEFAULT FALSE,
    FOREIGN KEY (QuestionID) REFERENCES Questions(QuestionID) ON DELETE CASCADE
);