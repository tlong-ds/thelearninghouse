-- 1. Thiết lập delimiter để định nghĩa trigger
drop trigger if exists trg_after_insert_enrollment;
drop trigger if exists trg_after_update_enrollment;

select * from Enrollments;

DELIMITER $$

CREATE TRIGGER trg_after_insert_enrollment
AFTER INSERT ON Enrollments
FOR EACH ROW
BEGIN
  -- Insert các dòng tương ứng vào LectureResults
  INSERT INTO LectureResults (LearnerID, CourseID, LectureID, Score, Date, State)
  SELECT NEW.LearnerID, NEW.CourseID, LectureID, 0, NULL, 'Unpassed'
  FROM Lectures
  WHERE CourseID = NEW.CourseID;
END$$

DELIMITER ;

select * from lectureresults;
select * from enrollments;
select * from courses;
select * from lectures where CourseID = 16;

drop trigger if exists trg_courses_after_update_rating;
DELIMITER $$
CREATE TRIGGER trg_courses_after_update_rating
AFTER UPDATE ON Enrollments
FOR EACH ROW
BEGIN
  -- Chạy khi Rating thực sự thay đổi (kể cả NULL ↔ giá trị)
  IF NOT (OLD.Rating <=> NEW.Rating) THEN
    UPDATE Courses
    SET AverageRating = (
      SELECT ROUND(AVG(Rating), 2)
      FROM Enrollments
      WHERE CourseID = NEW.CourseID
        AND Rating IS NOT NULL
    )
    WHERE CourseID = NEW.CourseID;
  END IF;
END$$
DELIMITER ;

-- Add trigger to update completion status
DROP TRIGGER IF EXISTS trg_update_completion_status;
DELIMITER $$
CREATE TRIGGER trg_update_completion_status
AFTER UPDATE ON LectureResults
FOR EACH ROW
BEGIN
    DECLARE total_lectures INT;
    DECLARE passed_lectures INT;
    DECLARE completion_percentage DECIMAL(5,2);
    
    -- Get total number of lectures for the course
    SELECT COUNT(*) INTO total_lectures
    FROM Lectures
    WHERE CourseID = NEW.CourseID;
    
    -- Get number of passed lectures for this learner
    SELECT COUNT(*) INTO passed_lectures
    FROM LectureResults
    WHERE LearnerID = NEW.LearnerID
    AND CourseID = NEW.CourseID
    AND State = 'Passed';
    
    -- Calculate completion percentage
    SET completion_percentage = (passed_lectures / total_lectures) * 100;
    
    -- Update enrollment status
    UPDATE Enrollments
    SET CompletionStatus = CASE
        WHEN completion_percentage = 100 THEN 'Completed'
        WHEN completion_percentage > 0 THEN 'In Progress'
        ELSE 'Not Started'
    END
    WHERE LearnerID = NEW.LearnerID
    AND CourseID = NEW.CourseID;
END$$
DELIMITER ;