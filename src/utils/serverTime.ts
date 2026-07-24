// 기기(노트북) 시계가 틀어져 있어도 모든 클라이언트가 같은 '서버 기준 현재시각'으로
// 실습 타이머·자동 잠금·공개 만료를 계산하도록 로컬시계 오프셋을 보정한다.
//
// 왜 필요한가: 실습 타이머는 공개 순간 "끝나는 절대 시각(endsAt)"을 저장하고, 각 기기가
// 자기 로컬 Date.now()로 (endsAt - 지금)을 그린다. 학생 노트북 시계가 예컨대 18분 느리면
// 5분 타이머가 그 학생에게는 23분으로 보인다. 서버 시각을 기준점으로 삼아 이 편차를 없앤다.
//
// 어떻게: 앱과 같은 오리진(Firebase Hosting / dev 서버) 응답의 Date 헤더로 서버 시각을 재고
// 로컬시계와의 차(offsetMs)를 저장한다 → serverNow() = Date.now() + offsetMs.
// 별도 백엔드·의존성·쓰기 권한이 필요 없다(읽기 전용 학생 화면에서도 동작).
// 보정 실패(오프라인 등) 시 offsetMs=0 이라 기존처럼 로컬시계로 폴백한다.

let offsetMs = 0;
let calibrated = false;

/** 서버 기준 현재시각(ms). 보정 전에는 로컬시계와 동일. 타이머 계산은 전부 이 값을 쓴다. */
export function serverNow(): number {
  return Date.now() + offsetMs;
}

/** 한 번이라도 서버시각 보정에 성공했는지. */
export function isServerTimeCalibrated(): boolean {
  return calibrated;
}

/** 현재 보정 오프셋(ms). 디버깅·표시용. */
export function getServerTimeOffset(): number {
  return offsetMs;
}

/**
 * 오리진 응답의 Date 헤더로 서버시각을 재 로컬시계와의 오프셋을 갱신한다.
 * 왕복 지연의 절반을 서버시각에 더해 편도 지연을 보정한다(Date 헤더는 1초 해상도라 ±1초 수준).
 * 앱 시작 시 1회 + 주기적으로 호출한다. 실패해도 조용히 로컬시계를 유지한다.
 */
export async function calibrateServerTime(): Promise<void> {
  try {
    const t0 = Date.now();
    const res = await fetch(`${window.location.origin}/?_clock=${t0}`, {
      method: 'GET',
      cache: 'no-store',
    });
    const t1 = Date.now();
    const dateHeader = res.headers.get('date');
    if (!dateHeader) return;
    const serverMs = new Date(dateHeader).getTime();
    if (!Number.isFinite(serverMs)) return;
    // 요청~응답 왕복의 중간 시점을 서버시각에 대응시킨다.
    const clientMid = t0 + (t1 - t0) / 2;
    offsetMs = serverMs - clientMid;
    calibrated = true;
  } catch {
    // 네트워크 실패 등 — 로컬시계 유지(폴백).
  }
}
