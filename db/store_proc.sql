use onlinelearning;

select * from enrollments;
select * from lectureresults;

SET @@foreign_key_checks = 1;
DELIMITER $$
/****************************************************************
  1. sp_EnrollLearner
     – Ghi Enrollments
     – Khởi tạo CourseStatuses (Percentage = 0, Rating = NULL)
****************************************************************/
DROP PROCEDURE IF EXISTS sp_EnrollLearner$$
CREATE PROCEDURE sp_EnrollLearner
(
  IN pLearnerID   INT,
  IN pCourseID    INT,
  IN pEnrollDate  DATE
)
BEGIN
  -- rollback on any SQL exception, then re-raise ↓
  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    RESIGNAL;
  END;

  START TRANSACTION;

  -- 1) learner phải tồn tại
  IF NOT EXISTS (
    SELECT 1
    FROM Learners
    WHERE LearnerID = pLearnerID
  ) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Learner does not exist';
  END IF;

  -- 2) chưa enroll trong course này
  IF EXISTS (
    SELECT 1
    FROM Enrollments
    WHERE LearnerID = pLearnerID
      AND CourseID  = pCourseID
  ) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Learner already enrolled in this course';
  END IF;

  -- 3) chèn enroll với ngày truyền vào
  INSERT INTO Enrollments (EnrollmentDate, LearnerID, CourseID, Percentage, Rating)
  VALUES (pEnrollDate, pLearnerID, pCourseID, 0, 0);

  COMMIT;
END$$



-- 2. Ghi điểm bài giảng
drop procedure if exists sp_update_lecture_result;

drop procedure if exists sp_AddLectureResult;

DELIMITER $$
CREATE PROCEDURE sp_update_lecture_result (
  IN p_learner_id INT,
  IN p_course_id INT,
  IN p_lecture_id INT,
  IN p_score INT
)
BEGIN
  -- Khai báo biến phải nằm ngay sau BEGIN
  DECLARE total_lectures INT DEFAULT 0;
  DECLARE passed_lectures INT DEFAULT 0;
  DECLARE percentage_raw DECIMAL(5,2) DEFAULT 0;
  DECLARE percentage INT DEFAULT 0;

  -- 1. Cập nhật điểm và trạng thái
  UPDATE LectureResults
  SET 
    Score = p_score,
    State = CASE WHEN p_score >= 70 THEN 'passed' ELSE 'unpassed' END,
    `Date` = NOW()
  WHERE 
    LearnerID = p_learner_id 
    AND CourseID = p_course_id 
    AND LectureID = p_lecture_id;

  -- 2. Lấy tổng số bài giảng và số bài đã pass
  SELECT COUNT(*) 
    INTO total_lectures 
    FROM Lectures 
    WHERE CourseID = p_course_id;

  SELECT COUNT(*) 
    INTO passed_lectures 
    FROM LectureResults 
    WHERE 
      LearnerID = p_learner_id 
      AND CourseID = p_course_id 
      AND State = 'passed';

  -- 3. Tính phần trăm, tránh chia cho 0
  IF total_lectures = 0 THEN
    SET percentage_raw = 0;
  ELSE
    SET percentage_raw = passed_lectures * 100.0 / total_lectures;
  END IF;

  -- 4. Chuyển về mốc % theo thang điểm
  SET percentage = CASE
    WHEN percentage_raw < 10 THEN 0
    WHEN percentage_raw < 30 THEN 20
    WHEN percentage_raw < 50 THEN 40
    WHEN percentage_raw < 70 THEN 60
    WHEN percentage_raw < 90 THEN 80
    ELSE 100
  END;

  -- 5. Cập nhật vào bảng trạng thái khóa học
  UPDATE Enrollments
  SET Percentage = percentage
  WHERE 
    LearnerID = p_learner_id 
    AND CourseID = p_course_id;
END$$

DELIMITER ;

call sp_update_lecture_result(13, 25, 124, 85);
select * from lectureresults;
select * from enrollments;


-- 3. Chấm điểm khóa

DROP PROCEDURE IF EXISTS sp_RateCourse;

DELIMITER $$
CREATE PROCEDURE sp_RateCourse
(
    IN pLearnerID INT,
    IN pCourseID  INT,
    IN pRating    INT
)
BEGIN
    IF pRating < 1 OR pRating > 5 THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Rating must be between 1 and 5';
    END IF;

    UPDATE Enrollments
    SET    Rating = pRating
    WHERE  LearnerID = pLearnerID
      AND  CourseID  = pCourseID;
END$$

DELIMITER ;

select * from enrollments;
CALL sp_RateCourse(15, 37, 5);
select * from courses;