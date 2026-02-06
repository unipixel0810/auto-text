'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';

// ============================================
// 타입 정의
// ============================================

type UploadStatus = 'idle' | 'uploading' | 'ready' | 'error';

interface VideoUploaderProps {
  onFileReady?: (file: File) => void;
  onError?: (error: string) => void;
  maxSizeMB?: number;
  acceptedFormats?: string[];
}

// ============================================
// 상수
// ============================================

const DEFAULT_MAX_SIZE_MB = Infinity; // 무제한
const DEFAULT_ACCEPTED_FORMATS = ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo'];

// ============================================
// 유틸리티 함수
// ============================================

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// ============================================
// 메인 컴포넌트
// ============================================

export default function VideoUploader({
  onFileReady,
  onError,
  maxSizeMB = DEFAULT_MAX_SIZE_MB,
  acceptedFormats = DEFAULT_ACCEPTED_FORMATS,
}: VideoUploaderProps) {
  const [status, setStatus] = useState<UploadStatus>('idle');
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  // 파일 유효성 검사
  const validateFile = useCallback(
    (file: File): string | null => {
      // 비디오 파일인지 확인 (더 관대한 검사)
      const isVideo = file.type.startsWith('video/') || 
        file.name.match(/\.(mp4|webm|mov|avi|mkv|m4v)$/i);
      
      if (!isVideo) {
        return `지원하지 않는 파일 형식입니다. (${file.type || '알 수 없는 형식'})`;
      }
      // 무제한이 아닐 때만 크기 검사
      if (maxSizeMB !== Infinity) {
        const maxSizeBytes = maxSizeMB * 1024 * 1024;
        if (file.size > maxSizeBytes) {
          return `파일 크기가 너무 큽니다. (최대 ${maxSizeMB >= 1024 ? (maxSizeMB / 1024).toFixed(0) + 'GB' : maxSizeMB + 'MB'})`;
        }
      }
      return null;
    },
    [maxSizeMB]
  );

  // 파일 처리
  const processFile = useCallback(
    (file: File) => {
      console.log('Processing file:', file.name, file.type, file.size);
      setErrorMessage('');
      const validationError = validateFile(file);
      if (validationError) {
        console.log('Validation error:', validationError);
        setErrorMessage(validationError);
        setStatus('error');
        onError?.(validationError);
        return;
      }
      
      console.log('File validated, calling onFileReady');
      setVideoFile(file);
      setStatus('ready');
      if (onFileReady) {
        onFileReady(file);
      }
    },
    [validateFile, onFileReady, onError]
  );

  // 파일 선택 핸들러
  const handleFileSelect = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (file) processFile(file);
    },
    [processFile]
  );

  // 드래그 핸들러
  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragActive(false);

      const file = e.dataTransfer.files?.[0];
      if (file && file.type.startsWith('video/')) {
        processFile(file);
      } else {
        setErrorMessage('비디오 파일만 업로드할 수 있습니다.');
        setStatus('error');
      }
    },
    [processFile]
  );

  const handleUploadClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    console.log('Upload click triggered');
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  }, []);

  return (
    <div
      onDragEnter={handleDrag}
      onDragLeave={handleDrag}
      onDragOver={handleDrag}
      onDrop={handleDrop}
      onClick={handleUploadClick}
      className={`
        relative rounded-2xl border-2 border-dashed transition-all duration-300 cursor-pointer
        flex flex-col items-center justify-center p-12 text-center
        ${dragActive ? 'scale-[1.02]' : ''}
      `}
      style={{
        borderColor: dragActive ? 'hsl(185 100% 50%)' : 'hsl(220 15% 18%)',
        background: dragActive ? 'hsl(185 100% 50% / 0.05)' : 'transparent',
        boxShadow: dragActive ? '0 0 30px hsl(185 100% 50% / 0.2)' : 'none'
      }}
    >
      {/* Scanning animation */}
      {dragActive && (
        <div className="absolute inset-0 overflow-hidden rounded-2xl">
          <div 
            className="absolute inset-x-0 h-1 animate-scan"
            style={{ background: 'linear-gradient(90deg, transparent, hsl(185 100% 50%), transparent)' }}
          />
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="video/*,.mp4,.webm,.mov,.avi,.mkv,.m4v"
        onChange={handleFileSelect}
        className="hidden"
      />

      {/* 아이콘 */}
      <div 
        className={`w-16 h-16 rounded-full flex items-center justify-center mb-4 transition-all duration-300 ${
          dragActive ? 'scale-110' : ''
        }`}
        style={{ 
          background: dragActive ? 'hsl(185 100% 50% / 0.2)' : 'hsl(220 15% 12%)'
        }}
      >
        <svg 
          className="w-8 h-8 transition-colors duration-300" 
          style={{ color: dragActive ? 'hsl(185 100% 50%)' : 'hsl(215 20% 55%)' }}
          fill="none" 
          viewBox="0 0 24 24" 
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
        </svg>
      </div>

      {/* 텍스트 */}
      <h3 className="text-lg font-semibold mb-2" style={{ color: 'hsl(210 40% 98%)' }}>
        영상 파일 업로드
      </h3>
      <p className="text-sm mb-4" style={{ color: 'hsl(215 20% 55%)' }}>
        드래그 앤 드롭 또는 클릭하여 파일 선택
      </p>

      {/* 지원 형식 */}
      <div className="flex items-center gap-2 text-xs" style={{ color: 'hsl(215 20% 45%)' }}>
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z" />
        </svg>
        <span>MP4, WebM, MOV, AVI · 무제한</span>
      </div>

      {/* 에러 메시지 */}
      {errorMessage && (
        <p className="mt-4 text-sm" style={{ color: 'hsl(0 72% 60%)' }}>
          {errorMessage}
        </p>
      )}
    </div>
  );
}
