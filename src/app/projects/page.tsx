'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
    getAllProjects, deleteProject, renameProject,
    formatDate, formatFileSize, setCurrentProjectId,
    type SavedProject
} from '@/lib/projectStorage';

export default function ProjectsPage() {
    const router = useRouter();
    const [projects, setProjects] = useState<SavedProject[]>([]);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editName, setEditName] = useState('');
    const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
    const [sortBy, setSortBy] = useState<'updatedAt' | 'createdAt' | 'name'>('updatedAt');

    useEffect(() => {
        setProjects(getAllProjects());
    }, []);

    const sortedProjects = [...projects].sort((a, b) => {
        if (sortBy === 'name') return a.name.localeCompare(b.name);
        return new Date(b[sortBy]).getTime() - new Date(a[sortBy]).getTime();
    });

    const handleOpen = (id: string) => {
        setCurrentProjectId(id);
        router.push('/');
    };

    const handleNewProject = () => {
        setCurrentProjectId(null);
        router.push('/');
    };

    const handleRename = (id: string) => {
        if (editName.trim()) {
            renameProject(id, editName.trim());
            setProjects(getAllProjects());
        }
        setEditingId(null);
    };

    const handleDelete = (id: string) => {
        deleteProject(id);
        setProjects(getAllProjects());
        setDeleteConfirm(null);
    };

    const formatDuration = (seconds?: number) => {
        if (!seconds) return '--:--';
        const m = Math.floor(seconds / 60);
        const s = Math.floor(seconds % 60);
        return `${m}:${s.toString().padStart(2, '0')}`;
    };

    return (
        <div className="min-h-screen bg-editor-bg text-white">
            {/* Header */}
            <header className="border-b border-white/5 bg-editor-bg/80 backdrop-blur-xl sticky top-0 z-40">
                <div className="max-w-6xl mx-auto flex items-center justify-between px-6 py-3">
                    <div className="flex items-center gap-2 cursor-pointer" onClick={() => router.push('/landing')}>
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-400 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/20">
                            <span className="material-icons text-white text-lg">auto_awesome</span>
                        </div>
                        <span className="text-lg font-bold tracking-tight">AutoText</span>
                    </div>
                    <div className="flex items-center gap-3">
                        <button
                            onClick={handleNewProject}
                            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-cyan-500 to-blue-600 text-white text-sm font-semibold rounded-lg hover:brightness-110 active:scale-95 transition-all shadow-lg shadow-cyan-500/20"
                        >
                            <span className="material-icons text-lg">add</span>
                            새 프로젝트
                        </button>
                    </div>
                </div>
            </header>

            {/* Main Content */}
            <main className="max-w-6xl mx-auto px-6 py-10">
                <div className="flex items-center justify-between mb-8">
                    <div>
                        <h1 className="text-3xl font-bold">프로젝트 보관함</h1>
                        <p className="text-gray-400 text-sm mt-1">
                            {projects.length > 0 ? `총 ${projects.length}개의 프로젝트` : '저장된 프로젝트가 없습니다'}
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-500">정렬:</span>
                        <select
                            value={sortBy}
                            onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                            className="bg-white/5 border border-white/10 text-sm text-gray-300 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                        >
                            <option value="updatedAt">최근 수정순</option>
                            <option value="createdAt">생성일순</option>
                            <option value="name">이름순</option>
                        </select>
                    </div>
                </div>

                {projects.length === 0 ? (
                    <div className="text-center py-20">
                        <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-white/5 border border-white/10 mb-6">
                            <span className="material-icons text-4xl text-gray-500">movie_creation</span>
                        </div>
                        <h2 className="text-xl font-semibold text-gray-300 mb-2">아직 프로젝트가 없습니다</h2>
                        <p className="text-gray-500 text-sm mb-6">새 프로젝트를 만들어 영상 편집을 시작하세요!</p>
                        <button
                            onClick={handleNewProject}
                            className="px-6 py-3 bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-semibold rounded-xl hover:brightness-110 active:scale-95 transition-all shadow-lg shadow-cyan-500/20"
                        >
                            첫 프로젝트 만들기
                        </button>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                        {/* New Project Card */}
                        <div
                            onClick={handleNewProject}
                            className="border-2 border-dashed border-white/10 rounded-xl p-8 flex flex-col items-center justify-center gap-3 cursor-pointer hover:border-cyan-500/40 hover:bg-white/[0.02] transition-all group min-h-[200px]"
                        >
                            <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center group-hover:bg-cyan-500/10 transition-colors">
                                <span className="material-icons text-2xl text-gray-500 group-hover:text-cyan-400 transition-colors">add</span>
                            </div>
                            <span className="text-sm text-gray-500 group-hover:text-gray-300 transition-colors font-medium">새 프로젝트</span>
                        </div>

                        {/* Existing Projects */}
                        {sortedProjects.map((project) => (
                            <div
                                key={project.id}
                                className="bg-[#111118] border border-white/10 rounded-xl overflow-hidden hover:border-cyan-500/30 transition-all group cursor-pointer"
                                onClick={() => handleOpen(project.id)}
                            >
                                {/* Thumbnail */}
                                <div className="h-32 bg-[#0a0a12] flex items-center justify-center relative overflow-hidden">
                                    {project.thumbnail ? (
                                        <img src={project.thumbnail} alt="" className="w-full h-full object-cover" />
                                    ) : (
                                        <div className="flex flex-col items-center gap-2">
                                            <span className="material-icons text-3xl text-gray-600">movie</span>
                                            <span className="text-[10px] text-gray-600">{project.videoFileName || '영상 없음'}</span>
                                        </div>
                                    )}
                                    {/* Duration badge */}
                                    {project.videoDuration && (
                                        <span className="absolute bottom-2 right-2 bg-black/70 text-[10px] text-white px-1.5 py-0.5 rounded font-mono">
                                            {formatDuration(project.videoDuration)}
                                        </span>
                                    )}
                                    {/* Hover play icon */}
                                    <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <span className="material-icons text-4xl text-white">play_circle_filled</span>
                                    </div>
                                </div>

                                {/* Info */}
                                <div className="p-4">
                                    {editingId === project.id ? (
                                        <input
                                            autoFocus
                                            value={editName}
                                            onChange={(e) => setEditName(e.target.value)}
                                            onBlur={() => handleRename(project.id)}
                                            onKeyDown={(e) => { if (e.key === 'Enter') handleRename(project.id); if (e.key === 'Escape') setEditingId(null); }}
                                            onClick={(e) => e.stopPropagation()}
                                            className="w-full bg-black/40 border border-cyan-500 rounded px-2 py-1 text-sm text-white focus:outline-none"
                                        />
                                    ) : (
                                        <h3 className="font-semibold text-sm truncate group-hover:text-cyan-400 transition-colors">{project.name}</h3>
                                    )}
                                    <div className="flex items-center gap-3 mt-2 text-[11px] text-gray-500">
                                        <span className="flex items-center gap-1">
                                            <span className="material-icons text-[11px]">schedule</span>
                                            {formatDate(project.updatedAt)}
                                        </span>
                                        {project.videoSize && (
                                            <span className="flex items-center gap-1">
                                                <span className="material-icons text-[11px]">sd_storage</span>
                                                {formatFileSize(project.videoSize)}
                                            </span>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-2 mt-2 text-[10px] text-gray-600">
                                        {project.transcripts.length > 0 && (
                                            <span className="bg-green-500/10 text-green-400 px-1.5 py-0.5 rounded">자막 {project.transcripts.length}개</span>
                                        )}
                                        {project.subtitles.length > 0 && (
                                            <span className="bg-purple-500/10 text-purple-400 px-1.5 py-0.5 rounded">AI {project.subtitles.length}개</span>
                                        )}
                                    </div>

                                    {/* Actions */}
                                    <div className="flex items-center gap-1 mt-3 pt-3 border-t border-white/5">
                                        <button
                                            onClick={(e) => { e.stopPropagation(); setEditingId(project.id); setEditName(project.name); }}
                                            className="flex items-center gap-1 px-2 py-1 text-[10px] text-gray-500 hover:text-white hover:bg-white/10 rounded transition-all"
                                        >
                                            <span className="material-icons text-[12px]">edit</span>
                                            이름 변경
                                        </button>
                                        {deleteConfirm === project.id ? (
                                            <>
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); handleDelete(project.id); }}
                                                    className="flex items-center gap-1 px-2 py-1 text-[10px] text-red-400 bg-red-500/10 rounded"
                                                >
                                                    삭제 확인
                                                </button>
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); setDeleteConfirm(null); }}
                                                    className="flex items-center gap-1 px-2 py-1 text-[10px] text-gray-500 hover:text-white rounded"
                                                >
                                                    취소
                                                </button>
                                            </>
                                        ) : (
                                            <button
                                                onClick={(e) => { e.stopPropagation(); setDeleteConfirm(project.id); }}
                                                className="flex items-center gap-1 px-2 py-1 text-[10px] text-gray-500 hover:text-red-400 hover:bg-red-500/10 rounded transition-all"
                                            >
                                                <span className="material-icons text-[12px]">delete</span>
                                                삭제
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </main>
        </div>
    );
}
