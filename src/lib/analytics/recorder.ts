/**
 * 세션 녹화 모듈
 * 사용자의 행동을 기록하여 나중에 재생할 수 있도록 함
 */

export interface RecordedEvent {
  type: 'dom_change' | 'click' | 'scroll' | 'input' | 'navigation' | 'resize' | 'mouse_move';
  timestamp: number;
  data: {
    // DOM 변경
    mutations?: {
      type: 'childList' | 'attributes' | 'characterData';
      target: string; // selector
      addedNodes?: number;
      removedNodes?: number;
      attributeName?: string;
    }[];
    // 클릭
    x?: number;
    y?: number;
    element?: {
      tag?: string;
      id?: string;
      class?: string;
      text?: string;
    };
    // 스크롤
    scrollX?: number;
    scrollY?: number;
    // 입력
    inputValue?: string;
    inputType?: string;
    // 네비게이션
    url?: string;
    // 리사이즈
    width?: number;
    height?: number;
    // 마우스 이동
    clientX?: number;
    clientY?: number;
  };
}

export interface SessionRecord {
  session_id: string;
  page_url: string;
  start_time: number;
  end_time: number;
  events: RecordedEvent[];
}

const MAX_EVENTS = 10000;
const DEBOUNCE_MS = 100;

export class SessionRecorder {
  private events: RecordedEvent[] = [];
  private startTime: number = 0;
  private mutationObserver: MutationObserver | null = null;
  private isRecording: boolean = false;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private lastMouseMoveTime: number = 0;
  private readonly MOUSE_MOVE_THROTTLE = 50; // 50ms마다 마우스 이동 기록

  constructor() {
    this.handleBeforeUnload = this.handleBeforeUnload.bind(this);
    this.handleMutation = this.handleMutation.bind(this);
    this.handleClick = this.handleClick.bind(this);
    this.handleScroll = this.handleScroll.bind(this);
    this.handleInput = this.handleInput.bind(this);
    this.handleMouseMove = this.handleMouseMove.bind(this);
    this.handleResize = this.handleResize.bind(this);
  }

  /**
   * 녹화 시작
   */
  start(): void {
    if (this.isRecording) return;
    if (typeof window === 'undefined') return;

    this.isRecording = true;
    this.startTime = Date.now();
    this.events = [];

    // DOM 변경 추적
    this.mutationObserver = new MutationObserver((mutations) => {
      if (this.debounceTimer) {
        clearTimeout(this.debounceTimer);
      }
      this.debounceTimer = setTimeout(() => {
        this.handleMutation(mutations);
      }, DEBOUNCE_MS);
    });

    this.mutationObserver.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeOldValue: false,
      characterData: true,
      characterDataOldValue: false,
    });

    // 이벤트 리스너 등록
    document.addEventListener('click', this.handleClick, true);
    window.addEventListener('scroll', this.handleScroll, true);
    document.addEventListener('input', this.handleInput, true);
    document.addEventListener('mousemove', this.handleMouseMove, true);
    window.addEventListener('resize', this.handleResize);
    window.addEventListener('beforeunload', this.handleBeforeUnload);

    // 초기 상태 기록
    this.recordEvent('navigation', {
      url: window.location.href,
    });

    // 초기 DOM 상태 기록
    this.recordEvent('dom_change', {
      mutations: [{
        type: 'childList',
        target: 'body',
        addedNodes: document.body.children.length,
      }],
    });
  }

  /**
   * 녹화 중지 및 저장
   */
  async stop(): Promise<void> {
    if (!this.isRecording) return;

    this.isRecording = false;
    const endTime = Date.now();

    // 리스너 제거
    if (this.mutationObserver) {
      this.mutationObserver.disconnect();
      this.mutationObserver = null;
    }

    document.removeEventListener('click', this.handleClick, true);
    window.removeEventListener('scroll', this.handleScroll, true);
    document.removeEventListener('input', this.handleInput, true);
    document.removeEventListener('mousemove', this.handleMouseMove, true);
    window.removeEventListener('resize', this.handleResize);
    window.removeEventListener('beforeunload', this.handleBeforeUnload);

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    // 이벤트 수 제한
    if (this.events.length > MAX_EVENTS) {
      this.events = this.events.slice(0, MAX_EVENTS);
    }

    // 세션 기록 생성
    const sessionRecord: SessionRecord = {
      session_id: this.getSessionId(),
      page_url: window.location.pathname + window.location.search,
      start_time: this.startTime,
      end_time: endTime,
      events: this.events,
    };

    // 서버에 저장
    try {
      await fetch('/api/analytics/record', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sessionRecord),
      });
    } catch (error) {
      console.error('[SessionRecorder] Failed to save session:', error);
    }
  }

  /**
   * 이벤트 기록
   */
  private recordEvent(type: RecordedEvent['type'], data: RecordedEvent['data']): void {
    if (!this.isRecording) return;
    if (this.events.length >= MAX_EVENTS) return;

    this.events.push({
      type,
      timestamp: Date.now() - this.startTime,
      data,
    });
  }

  /**
   * DOM 변경 처리
   */
  private handleMutation(mutations: MutationRecord[]): void {
    const simplifiedMutations = mutations.map(mutation => {
      const target = this.getElementSelector(mutation.target as Element);
      return {
        type: mutation.type as 'childList' | 'attributes' | 'characterData',
        target,
        addedNodes: mutation.addedNodes.length,
        removedNodes: mutation.removedNodes.length,
        attributeName: mutation.attributeName || undefined,
      };
    });

    this.recordEvent('dom_change', {
      mutations: simplifiedMutations,
    });
  }

  /**
   * 클릭 이벤트 처리
   */
  private handleClick(e: MouseEvent): void {
    const target = e.target as HTMLElement;
    if (!target) return;

    // 민감한 정보 제외
    if (this.isSensitiveElement(target)) return;

    this.recordEvent('click', {
      x: e.clientX,
      y: e.clientY,
      element: {
        tag: target.tagName?.toLowerCase(),
        id: target.id ? String(target.id).toLowerCase() : undefined,
        class: target.className && typeof target.className === 'string'
          ? target.className.split(' ').slice(0, 3).join(' ')
          : undefined,
        text: (target.textContent || '').trim().slice(0, 50) || undefined,
      },
    });
  }

  /**
   * 스크롤 이벤트 처리
   */
  private handleScroll(): void {
    this.recordEvent('scroll', {
      scrollX: window.scrollX,
      scrollY: window.scrollY,
    });
  }

  /**
   * 입력 이벤트 처리
   */
  private handleInput(e: Event): void {
    const target = e.target as HTMLInputElement | HTMLTextAreaElement;
    if (!target) return;

    // 민감한 정보 제외
    if (this.isSensitiveElement(target)) return;

    // 비밀번호 필드는 값 제외
    const isPassword = target.type === 'password';
    const value = isPassword ? '[REDACTED]' : target.value.slice(0, 100);

    this.recordEvent('input', {
      inputValue: value,
      inputType: target.type || 'text',
      element: {
        tag: target.tagName?.toLowerCase(),
        id: target.id ? String(target.id).toLowerCase() : undefined,
        class: target.className && typeof target.className === 'string'
          ? target.className.split(' ').slice(0, 3).join(' ')
          : undefined,
      },
    });
  }

  /**
   * 마우스 이동 이벤트 처리 (throttled)
   */
  private handleMouseMove(e: MouseEvent): void {
    const now = Date.now();
    if (now - this.lastMouseMoveTime < this.MOUSE_MOVE_THROTTLE) return;
    this.lastMouseMoveTime = now;

    // 마우스 이동은 샘플링하여 기록 (너무 많으면 제외)
    if (this.events.length > MAX_EVENTS * 0.8) return;

    this.recordEvent('mouse_move', {
      clientX: e.clientX,
      clientY: e.clientY,
    });
  }

  /**
   * 리사이즈 이벤트 처리
   */
  private handleResize(): void {
    this.recordEvent('resize', {
      width: window.innerWidth,
      height: window.innerHeight,
    });
  }

  /**
   * 페이지 이탈 시 저장
   */
  private handleBeforeUnload(): void {
    if (this.isRecording) {
      // 동기적으로 저장 시도 (sendBeacon 사용)
      const sessionRecord: SessionRecord = {
        session_id: this.getSessionId(),
        page_url: window.location.pathname + window.location.search,
        start_time: this.startTime,
        end_time: Date.now(),
        events: this.events.slice(0, MAX_EVENTS),
      };

      const blob = new Blob([JSON.stringify(sessionRecord)], { type: 'application/json' });
      navigator.sendBeacon('/api/analytics/record', blob);
    }
  }

  /**
   * 요소 선택자 생성
   */
  private getElementSelector(element: Element): string {
    if (!element) return 'unknown';

    if (element.id && typeof element.id === 'string') {
      return `#${element.id}`;
    }

    const tagName = (element.tagName || 'div').toLowerCase();

    if (element.className && typeof element.className === 'string') {
      const classes = element.className.split(' ').filter(Boolean).slice(0, 2).join('.');
      if (classes) {
        return `${tagName}.${classes}`;
      }
    }
    return tagName;
  }

  /**
   * 민감한 요소인지 확인
   */
  private isSensitiveElement(element: HTMLElement): boolean {
    const inputElement = element as HTMLInputElement;
    // 비밀번호 필드
    if (inputElement.type === 'password') return true;

    // 신용카드 필드
    const cardPatterns = ['card', 'credit', 'cvv', 'cvc'];
    const id = (element.id ? String(element.id) : '').toLowerCase();
    const name = (inputElement.name ? String(inputElement.name) : '').toLowerCase();
    if (cardPatterns.some(p => id.includes(p) || name.includes(p))) return true;

    // data-sensitive 속성이 있는 요소
    if (element.hasAttribute('data-sensitive')) return true;

    return false;
  }

  /**
   * 세션 ID 가져오기
   */
  private getSessionId(): string {
    if (typeof window === 'undefined') return 'ssr';

    try {
      const session = localStorage.getItem('analytics_session');
      if (session) {
        const parsed = JSON.parse(session);
        return parsed.session_id || 'unknown';
      }
    } catch {
      // ignore
    }

    return 'unknown';
  }
}

// 싱글톤 인스턴스
let recorderInstance: SessionRecorder | null = null;

export function getSessionRecorder(): SessionRecorder {
  if (!recorderInstance) {
    recorderInstance = new SessionRecorder();
  }
  return recorderInstance;
}
