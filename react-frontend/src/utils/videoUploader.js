import config from '../config';

/**
 * VideoUploader - A utility class for uploading videos to the backend
 * Supports both standard and chunked uploads with progress tracking and retry logic
 */
class VideoUploader {
  constructor() {
    this.API_URL = config.API_URL;
    this.chunkSize = 5 * 1024 * 1024; // 5MB chunk size (minimum for S3 multipart)
    this.maxRetries = 3;
    this.retryDelay = 2000; // 2 seconds
    this.abortController = null;
  }

  /**
   * Get authentication token from localStorage
   * @returns {string} The authentication token
   */
  getAuthToken() {
    return localStorage.getItem('auth_token');
  }

  /**
   * Create headers with authentication
   * @returns {Object} Headers object with auth token
   */
  createHeaders() {
    return {
      'Authorization': `Bearer ${this.getAuthToken()}`
    };
  }

  /**
   * Determine if a file should use chunked upload
   * @param {File} file - The file to check
   * @returns {boolean} True if the file should use chunked upload
   */
  shouldUseChunkedUpload(file) {
    return file.size > 10 * 1024 * 1024; // Use chunked upload for files larger than 10MB
  }

  /**
   * Compress video file before upload
   */
  async compressVideo(file, options = {}) {
    const {
      maxWidth = 1280,
      maxHeight = 720,
      quality = 0.8,
      bitrate = 1000000 // 1Mbps
    } = options;

    return new Promise((resolve, reject) => {
      const video = document.createElement('video');
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      
      video.onloadedmetadata = () => {
        // Calculate new dimensions maintaining aspect ratio
        const { videoWidth, videoHeight } = video;
        const aspectRatio = videoWidth / videoHeight;
        
        let newWidth = Math.min(videoWidth, maxWidth);
        let newHeight = Math.min(videoHeight, maxHeight);
        
        if (newWidth / newHeight !== aspectRatio) {
          if (newWidth / aspectRatio <= maxHeight) {
            newHeight = newWidth / aspectRatio;
          } else {
            newWidth = newHeight * aspectRatio;
          }
        }
        
        canvas.width = newWidth;
        canvas.height = newHeight;
        
        // For now, we'll return the original file as compression requires MediaRecorder API
        // which is more complex to implement properly
        resolve(file);
      };
      
      video.onerror = reject;
      video.src = URL.createObjectURL(file);
    });
  }

  /**
   * Upload video using the most appropriate method
   * @param {File} file - The video file to upload
   * @param {number} courseId - The course ID
   * @param {number} lectureId - The lecture ID
   * @param {function} onProgress - Progress callback function
   * @param {function} onError - Error callback function
   * @param {function} onSuccess - Success callback function
   */
  async uploadVideo(file, courseId, lectureId, onProgress, onError, onSuccess) {
    try {
      this.abortController = new AbortController();
      
      // Compress video if it's large
      let processedFile = file;
      if (file.size > 20 * 1024 * 1024) { // 20MB
        onProgress?.(5, 'Optimizing video...');
        processedFile = await this.compressVideo(file);
      }

      if (this.shouldUseChunkedUpload(processedFile)) {
        console.log(`Using chunked upload for ${processedFile.name} (${processedFile.size} bytes)`);
        await this.chunkedUpload(processedFile, courseId, lectureId, onProgress, onError, onSuccess);
      } else {
        console.log(`Using standard upload for ${processedFile.name} (${processedFile.size} bytes)`);
        await this.standardUpload(processedFile, courseId, lectureId, onProgress, onError, onSuccess);
      }
    } catch (error) {
      if (error.name === 'AbortError') {
        throw new Error('Upload cancelled');
      }
      console.error('Upload failed:', error);
      onError(error.message || 'Upload failed');
    }
  }

  /**
   * Standard upload for smaller files
   * @param {File} file - The video file to upload
   * @param {number} courseId - The course ID
   * @param {number} lectureId - The lecture ID
   * @param {function} onProgress - Progress callback function
   * @param {function} onError - Error callback function
   * @param {function} onSuccess - Success callback function
   */
  async standardUpload(file, courseId, lectureId, onProgress, onError, onSuccess) {
    try {
      const formData = new FormData();
      formData.append('video', file);
      formData.append('course_id', courseId);
      formData.append('lecture_id', lectureId);

      // Set up XMLHttpRequest for progress tracking
      const xhr = new XMLHttpRequest();
      
      // Track upload progress
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const percentComplete = Math.round((event.loaded / event.total) * 100);
          onProgress(percentComplete);
        }
      };

      // Promise wrapper for XMLHttpRequest
      const uploadPromise = new Promise((resolve, reject) => {
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const response = JSON.parse(xhr.responseText);
              resolve(response);
            } catch (e) {
              reject(new Error('Invalid response from server'));
            }
          } else {
            reject(new Error(`Upload failed with status ${xhr.status}: ${xhr.statusText}`));
          }
        };
        
        xhr.onerror = () => reject(new Error('Network error during upload'));
        xhr.ontimeout = () => reject(new Error('Upload timed out'));
      });

      // Configure and send the request
      xhr.open('POST', `${this.API_URL}/api/courses/${courseId}/lectures/${lectureId}/upload-video`, true);
      xhr.setRequestHeader('Authorization', `Bearer ${this.getAuthToken()}`);
      xhr.send(formData);

      const response = await uploadPromise;
      onSuccess(response);
      return response;
    } catch (error) {
      console.error('Standard upload failed:', error);
      onError(error.message || 'Standard upload failed');
      throw error;
    }
  }

  /**
   * Chunked upload implementation for larger files
   * @param {File} file - The video file to upload
   * @param {number} courseId - The course ID
   * @param {number} lectureId - The lecture ID
   * @param {function} onProgress - Progress callback function
   * @param {function} onError - Error callback function
   * @param {function} onSuccess - Success callback function
   */
  async chunkedUpload(file, courseId, lectureId, onProgress, onError, onSuccess) {
    try {
      // Step 1: Initialize the multipart upload
      const numParts = Math.ceil(file.size / this.chunkSize);
      console.log(`Initializing chunked upload with ${numParts} parts`);
      
      const initFormData = new FormData();
      initFormData.append('course_id', courseId);
      initFormData.append('lecture_id', lectureId);
      initFormData.append('file_size', file.size);
      initFormData.append('file_type', file.type);
      initFormData.append('parts', numParts);

      const initResponse = await fetch(`${this.API_URL}/api/upload/init-upload`, {
        method: 'POST',
        headers: this.createHeaders(),
        credentials: 'include',
        body: initFormData
      });

      if (!initResponse.ok) {
        throw new Error(`Failed to initialize upload: ${initResponse.statusText}`);
      }

      const { upload_id, presigned_urls } = await initResponse.json();
      console.log(`Upload initialized with ID: ${upload_id}`);
      onProgress(5); // Initial progress

      // Step 2: Upload each part
      const uploadedParts = [];
      let totalUploaded = 0;

      for (let partNumber = 1; partNumber <= numParts; partNumber++) {
        const start = (partNumber - 1) * this.chunkSize;
        const end = Math.min(start + this.chunkSize, file.size);
        const chunk = file.slice(start, end);
        
        // Get the presigned URL for this part
        const presignedUrl = presigned_urls[partNumber];
        if (!presignedUrl) {
          throw new Error(`Missing presigned URL for part ${partNumber}`);
        }

        // Upload the part with retry logic
        let retries = 0;
        let success = false;
        let etag = null;

        while (retries < this.maxRetries && !success) {
          try {
            const uploadResponse = await fetch(presignedUrl, {
              method: 'PUT',
              body: chunk
            });

            if (uploadResponse.ok) {
              success = true;
              etag = uploadResponse.headers.get('ETag');
              if (!etag) {
                etag = `"${Math.random().toString(36).substring(2, 15)}"`;
                console.warn(`No ETag received for part ${partNumber}, using generated value`);
              }
            } else {
              retries++;
              console.warn(`Upload failed for part ${partNumber}, attempt ${retries}/${this.maxRetries}`);
              await new Promise(resolve => setTimeout(resolve, this.retryDelay));
            }
          } catch (error) {
            retries++;
            console.error(`Error uploading part ${partNumber}:`, error);
            await new Promise(resolve => setTimeout(resolve, this.retryDelay));
          }
        }

        if (!success) {
          throw new Error(`Failed to upload part ${partNumber} after ${this.maxRetries} attempts`);
        }

        // Notify the server about the successful part upload
        const partFormData = new FormData();
        partFormData.append('upload_id', upload_id);
        partFormData.append('part_number', partNumber);
        partFormData.append('etag', etag);

        const partStatusResponse = await fetch(`${this.API_URL}/api/upload/upload-part`, {
          method: 'POST',
          headers: this.createHeaders(),
          credentials: 'include',
          body: partFormData
        });

        if (!partStatusResponse.ok) {
          throw new Error(`Failed to update part status: ${partStatusResponse.statusText}`);
        }

        // Track upload progress
        totalUploaded += (end - start);
        const percentComplete = 5 + Math.round((totalUploaded / file.size) * 90); // 5% for init, 90% for upload
        onProgress(percentComplete);

        uploadedParts.push({
          PartNumber: partNumber,
          ETag: etag
        });

        console.log(`Uploaded part ${partNumber}/${numParts} (${percentComplete}%)`);
      }

      // Step 3: Complete the multipart upload
      console.log('All parts uploaded, completing upload...');
      
      const completeFormData = new FormData();
      completeFormData.append('upload_id', upload_id);

      const completeResponse = await fetch(`${this.API_URL}/api/upload/complete-upload`, {
        method: 'POST',
        headers: this.createHeaders(),
        credentials: 'include',
        body: completeFormData
      });

      if (!completeResponse.ok) {
        throw new Error(`Failed to complete upload: ${completeResponse.statusText}`);
      }

      const result = await completeResponse.json();
      console.log('Upload completed successfully:', result);
      onProgress(100);
      onSuccess(result);
      return result;
    } catch (error) {
      console.error('Chunked upload failed:', error);
      onError(error.message || 'Chunked upload failed');
      throw error;
    }
  }

  /**
   * Cancel ongoing upload
   */
  cancel() {
    if (this.abortController) {
      this.abortController.abort();
    }
  }

  /**
   * Abort an in-progress chunked upload
   * @param {string} uploadId - The upload ID to abort
   * @returns {Promise<Object>} The abort response
   */
  async abortUpload(uploadId) {
    try {
      const formData = new FormData();
      formData.append('upload_id', uploadId);

      const response = await fetch(`${this.API_URL}/api/upload/abort-upload`, {
        method: 'POST',
        headers: this.createHeaders(),
        credentials: 'include',
        body: formData
      });

      if (!response.ok) {
        throw new Error(`Failed to abort upload: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error aborting upload:', error);
      throw error;
    }
  }

  /**
   * Get the status of an in-progress upload
   * @param {string} uploadId - The upload ID to check
   * @returns {Promise<Object>} The upload status
   */
  async getUploadStatus(uploadId) {
    try {
      const response = await fetch(`${this.API_URL}/api/upload/status/${uploadId}`, {
        method: 'GET',
        headers: this.createHeaders(),
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error(`Failed to get upload status: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error getting upload status:', error);
      throw error;
    }
  }
}

export default new VideoUploader();
