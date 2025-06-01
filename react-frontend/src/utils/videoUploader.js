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
    // Use chunked upload for files larger than 10MB
    const useChunked = file.size > 10 * 1024 * 1024;
    console.log(`shouldUseChunkedUpload called for file size: ${file.size} bytes (${Math.round(file.size / 1024 / 1024)}MB)`);
    console.log(`Returning ${useChunked} for chunked upload decision`);
    return useChunked;
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
      
      // Check file size limit - removed the 100MB restriction for chunked uploads
      const maxSize = 500 * 1024 * 1024; // 500MB max file size
      if (file.size > maxSize) {
        throw new Error(`File size (${Math.round(file.size / 1024 / 1024)}MB) exceeds the maximum allowed size of 500MB`);
      }
      
      // Compress video if it's large
      let processedFile = file;
      if (file.size > 20 * 1024 * 1024) { // 20MB
        onProgress?.(5, 'Optimizing video...');
        processedFile = await this.compressVideo(file);
      }

      const useChunked = this.shouldUseChunkedUpload(processedFile);
      console.log(`File size: ${processedFile.size} bytes (${Math.round(processedFile.size / 1024 / 1024)}MB)`);
      console.log(`shouldUseChunkedUpload returned: ${useChunked}`);

      if (useChunked) {
        console.log(`Using backend-proxied chunked upload for ${processedFile.name} (${processedFile.size} bytes)`);
        await this.backendProxiedChunkedUpload(processedFile, courseId, lectureId, onProgress, onError, onSuccess);
      } else {
        console.log(`Using standard upload for ${processedFile.name} (${processedFile.size} bytes)`);
        await this.standardUpload(processedFile, courseId, lectureId, onProgress, onError, onSuccess);
      }
    } catch (error) {
      if (error.name === 'AbortError') {
        throw new Error('Upload cancelled');
      }
      console.error('Upload failed:', error);
      onError?.(error.message || 'Upload failed');
      throw error;
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
   * Legacy chunked upload implementation - DEPRECATED
   * This method used direct S3 uploads with presigned URLs but caused CORS issues.
   * Use backendProxiedChunkedUpload() instead.
   * @deprecated Use backendProxiedChunkedUpload() for chunked uploads
   */
  async chunkedUpload() {
    throw new Error('Direct S3 chunked upload is deprecated due to CORS issues. Use backendProxiedChunkedUpload() instead.');
  }

  /**
   * Backend-proxied chunked upload implementation for larger files (avoids CORS issues)
   * @param {File} file - The video file to upload
   * @param {number} courseId - The course ID
   * @param {number} lectureId - The lecture ID
   * @param {function} onProgress - Progress callback function
   * @param {function} onError - Error callback function
   * @param {function} onSuccess - Success callback function
   */
  async backendProxiedChunkedUpload(file, courseId, lectureId, onProgress, onError, onSuccess) {
    try {
      // Step 1: Initialize the multipart upload
      const numParts = Math.ceil(file.size / this.chunkSize);
      console.log(`Initializing backend-proxied chunked upload with ${numParts} parts`);
      
      const initFormData = new FormData();
      initFormData.append('course_id', courseId);
      initFormData.append('lecture_id', lectureId);
      initFormData.append('file_size', file.size);
      initFormData.append('file_type', file.type);
      initFormData.append('parts', numParts);

      console.log('Sending init request to:', `${this.API_URL}/api/upload/proxy/init-upload`);
      console.log('Init form data:', Object.fromEntries(initFormData));

      const initResponse = await fetch(`${this.API_URL}/api/upload/proxy/init-upload`, {
        method: 'POST',
        headers: this.createHeaders(),
        credentials: 'include',
        body: initFormData
      });

      console.log('Init response status:', initResponse.status);
      
      if (!initResponse.ok) {
        const errorText = await initResponse.text();
        console.error('Init response error text:', errorText);
        throw new Error(`Failed to initialize upload: ${initResponse.status} ${initResponse.statusText} - ${errorText}`);
      }

      const initResponseData = await initResponse.json();
      console.log('Init response data:', initResponseData);
      
      const { upload_id } = initResponseData;
      console.log(`Backend-proxied upload initialized with ID: ${upload_id}`);
      onProgress(5); // Initial progress

      // Step 2: Upload each part through backend proxy
      let totalUploaded = 0;

      for (let partNumber = 1; partNumber <= numParts; partNumber++) {
        const start = (partNumber - 1) * this.chunkSize;
        const end = Math.min(start + this.chunkSize, file.size);
        const chunk = file.slice(start, end);
        
        console.log(`Uploading part ${partNumber}/${numParts} (${chunk.size} bytes) via backend proxy`);

        // Upload the part with retry logic
        let retries = 0;
        let success = false;

        while (retries < this.maxRetries && !success) {
          try {
            const partFormData = new FormData();
            partFormData.append('upload_id', upload_id);
            partFormData.append('part_number', partNumber);
            partFormData.append('chunk', chunk);

            const uploadResponse = await fetch(`${this.API_URL}/api/upload/proxy/upload-part`, {
              method: 'POST',
              headers: this.createHeaders(),
              credentials: 'include',
              body: partFormData
            });

            console.log(`Part ${partNumber} upload response status:`, uploadResponse.status);

            if (uploadResponse.ok) {
              success = true;
              const partResponse = await uploadResponse.json();
              console.log(`Part ${partNumber} uploaded successfully via backend proxy, ETag:`, partResponse.etag);
            } else {
              retries++;
              const errorText = await uploadResponse.text();
              console.error(`Upload failed for part ${partNumber}, attempt ${retries}/${this.maxRetries}:`, uploadResponse.status, errorText);
              if (retries < this.maxRetries) {
                await new Promise(resolve => setTimeout(resolve, this.retryDelay));
              }
            }
          } catch (error) {
            retries++;
            console.error(`Error uploading part ${partNumber}, attempt ${retries}/${this.maxRetries}:`, error);
            if (retries < this.maxRetries) {
              await new Promise(resolve => setTimeout(resolve, this.retryDelay));
            }
          }
        }

        if (!success) {
          throw new Error(`Failed to upload part ${partNumber} after ${this.maxRetries} attempts`);
        }

        // Track upload progress
        totalUploaded += (end - start);
        const percentComplete = 5 + Math.round((totalUploaded / file.size) * 90); // 5% for init, 90% for upload
        onProgress(percentComplete);

        console.log(`Uploaded part ${partNumber}/${numParts} (${percentComplete}%)`);
      }

      // Step 3: Complete the multipart upload
      console.log('All parts uploaded, completing backend-proxied upload...');
      
      const completeFormData = new FormData();
      completeFormData.append('upload_id', upload_id);

      console.log('Sending complete request to:', `${this.API_URL}/api/upload/proxy/complete-upload`);

      const completeResponse = await fetch(`${this.API_URL}/api/upload/proxy/complete-upload`, {
        method: 'POST',
        headers: this.createHeaders(),
        credentials: 'include',
        body: completeFormData
      });

      console.log('Complete response status:', completeResponse.status);

      if (!completeResponse.ok) {
        const errorText = await completeResponse.text();
        console.error('Complete response error text:', errorText);
        throw new Error(`Failed to complete upload: ${completeResponse.status} ${completeResponse.statusText} - ${errorText}`);
      }

      const result = await completeResponse.json();
      console.log('Backend-proxied upload completed successfully:', result);

      onProgress(100);
      onSuccess(result);
      return result;
    } catch (error) {
      console.error('Backend-proxied chunked upload failed with detailed error:', error);
      console.error('Error stack:', error.stack);
      onError(error.message || 'Backend-proxied chunked upload failed');
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
