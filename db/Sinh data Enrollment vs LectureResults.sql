use onlinelearning;
-- Insert Enrollments (khởi tạo tạm thời Percentage=0, Rating=1):
INSERT INTO Enrollments (EnrollmentDate, LearnerID, CourseID, Percentage, Rating)
SELECT 
  CURDATE() AS EnrollmentDate, 
  l.LearnerID, 
  c.CourseID,
  0,        -- để tạm, sẽ update sau
  1         -- rating tạm, sẽ update sau
FROM Learners l
JOIN Courses c ON c.CourseID IN ((l.LearnerID * 2 - 1), (l.LearnerID * 2))
WHERE c.CourseID <= (SELECT MAX(CourseID) FROM Courses);
-- Insert Date vào Lecture Results
INSERT INTO LectureResults (LearnerID, CourseID, LectureID, Score, Date, State)
SELECT
  e.LearnerID,
  e.CourseID,
  f.LectureID,
  0,
  CURDATE() - INTERVAL FLOOR(RAND()*30) DAY AS Date,
  0
FROM Enrollments e
JOIN FirstFiveLectures f ON e.CourseID = f.CourseID;

-- Tạo bảng tạm chứa 5 lecture đầu mỗi course
CREATE TEMPORARY TABLE FirstFiveLectures AS
SELECT LectureID, CourseID
FROM (
  SELECT LectureID, CourseID,
         ROW_NUMBER() OVER (PARTITION BY CourseID ORDER BY LectureID) AS rn
  FROM Lectures
) AS t
WHERE rn <= 5;
DELIMITER $$
-- Update Score and States
CREATE PROCEDURE UpdateScoresAndStates()
BEGIN
  DECLARE done INT DEFAULT FALSE;
  DECLARE v_LearnerID INT;
  DECLARE v_CourseID INT;
  DECLARE v_LectureID INT;
  DECLARE cur CURSOR FOR 
    SELECT LearnerID, CourseID, LectureID FROM LectureResults;
  DECLARE CONTINUE HANDLER FOR NOT FOUND SET done = TRUE;

  OPEN cur;

  read_loop: LOOP
    FETCH cur INTO v_LearnerID, v_CourseID, v_LectureID;
    IF done THEN
      LEAVE read_loop;
    END IF;

    UPDATE LectureResults
    SET 
      Score = FLOOR(RAND() * 101),
      State = CASE WHEN Score >= 70 THEN 'passed' ELSE 'unpassed' END
    WHERE LearnerID = v_LearnerID AND CourseID = v_CourseID AND LectureID = v_LectureID;

  END LOOP;

  CLOSE cur;
END $$

DELIMITER ;

CALL UpdateScoresAndStates();

DROP PROCEDURE UpdateScoresAndStates;
-- Update Percentage
UPDATE Enrollments e
JOIN (
  SELECT 
    LearnerID, 
    CourseID, 
    COUNT(*) AS passed_lectures
  FROM LectureResults
  WHERE State = 'passed'
  GROUP BY LearnerID, CourseID
) AS lr ON e.LearnerID = lr.LearnerID AND e.CourseID = lr.CourseID
SET e.Percentage = CASE 
    WHEN lr.passed_lectures = 0 THEN 0
    WHEN lr.passed_lectures = 1 THEN 20
    WHEN lr.passed_lectures = 2 THEN 40
    WHEN lr.passed_lectures = 3 THEN 60
    WHEN lr.passed_lectures = 4 THEN 80
    WHEN lr.passed_lectures = 5 THEN 100
    ELSE 0
END;
-- Update Rating
DELIMITER $$

CREATE PROCEDURE UpdateRatings()
BEGIN
  DECLARE done INT DEFAULT FALSE;
  DECLARE eid INT;
  DECLARE cur CURSOR FOR SELECT EnrollmentID FROM Enrollments;
  DECLARE CONTINUE HANDLER FOR NOT FOUND SET done = TRUE;

  OPEN cur;

  read_loop: LOOP
    FETCH cur INTO eid;
    IF done THEN
      LEAVE read_loop;
    END IF;

    UPDATE Enrollments
    SET Rating = FLOOR(1 + RAND() * 5)
    WHERE EnrollmentID = eid;

  END LOOP;

  CLOSE cur;
END $$

DELIMITER ;

CALL UpdateRatings();
DROP PROCEDURE UpdateRatings;
