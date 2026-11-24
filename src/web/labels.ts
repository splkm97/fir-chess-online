import type { Action, BoardSize, Color, GameResultReason, PieceKind } from '../game/types.ts';
import { cellLabel, SIZE } from '../game/types.ts';
export const colorName: Record<Color, string> = { black: '흑', white: '백' };
export const pieceName: Record<PieceKind, string> = { soldier: '군사', rook: '룩', bishop: '비숍', knight: '나이트', queen: '퀸' };
export const resultReason: Record<GameResultReason, string> = { 'two-lines': '오목 두 줄을 완성했습니다.', 'no-legal-action': '상대가 둘 수 있는 수가 없습니다.', 'turn-timeout': '상대의 착수 시간이 끝났습니다.', 'disconnect-timeout': '상대의 누적 재접속 대기 시간이 끝났습니다.' };
const errors: Record<string, string> = {
  UNAUTHENTICATED: '이 기보를 저장한 브라우저의 세션이 필요합니다. 쿠키를 지웠다면 닉네임만으로 복구할 수 없습니다.',
  RECORD_EXPIRED: '대국 종료 후 7일이 지나 기보 보관 기간이 끝났습니다.',
  RECORD_NOT_FOUND: '기보를 찾을 수 없거나 접근할 수 없습니다.',
  HISTORY_UNAVAILABLE: '과거 수순을 복원하지 못했습니다. 보존된 최종 보드만 확인할 수 있습니다.',
  ANALYSIS_NOT_ALLOWED: '종료되거나 중단된 대국에서만 분기를 둘 수 있습니다.',
  NODE_ID_REUSED: '이미 다른 수로 저장된 분기입니다. 기보를 다시 열어 확인해 주세요.',
  UNAUTHORIZED: '세션이 만료되었습니다. 새로고침한 뒤 닉네임을 다시 입력하세요.',
  SESSION_REQUIRED: '닉네임을 입력해 세션을 먼저 만들어 주세요.',
  FORBIDDEN: '이 방의 참가자가 아닙니다. 초대 코드로 입장해 주세요.',
  NOT_MEMBER: '이 방의 참가자가 아닙니다. 초대 코드로 입장해 주세요.',
  ROOM_NOT_FOUND: '방을 찾을 수 없습니다. 초대 코드를 확인하거나 새 방을 만들어 주세요.',
  ROOM_FULL: '이미 두 명이 참가한 방입니다. 다른 초대를 받거나 새 방을 만들어 주세요.',
  ROOM_EXPIRED: '대기 시간이 지나 방이 만료되었습니다. 새 방을 만들어 주세요.',
  ALREADY_IN_ROOM: '이미 참가 중인 방이 있습니다. 기존 방으로 돌아가 주세요.',
  ROOM_CONFLICT: '이미 참가 중인 방이 있습니다. 기존 방으로 돌아가 주세요.',
  RATE_LIMITED: '요청이 너무 많습니다. 잠시 뒤 다시 시도해 주세요.',
  INVALID_REQUEST: '입력 형식이 올바르지 않습니다. 닉네임과 방 코드를 확인해 주세요.',
  INVALID_MESSAGE: '서버와 메시지 형식이 다릅니다. 새로고침해 주세요.',
  INVALID_RESPONSE: '서버 응답을 읽을 수 없습니다. 잠시 뒤 다시 시도해 주세요.',
  NETWORK_ERROR: '서버에 연결할 수 없습니다. 인터넷 연결을 확인한 뒤 다시 시도해 주세요.',
  SERVER_ERROR: '서버가 요청을 저장하지 못했습니다. 같은 요청을 다시 확인해 주세요.',
  STALE_REVISION: '방 상태가 바뀌었습니다. 최신 보드를 확인하고 다시 선택해 주세요.',
  REVISION_MISMATCH: '방 상태가 바뀌었습니다. 최신 보드를 확인하고 다시 선택해 주세요.',
  NOT_YOUR_TURN: '지금은 상대의 차례입니다. 내 차례에 선택해 주세요.',
  GAME_FINISHED: '이미 끝난 경기입니다. 새 방에서 다시 시작할 수 있습니다.',
  ROOM_NOT_ACTIVE: '경기가 진행 중일 때만 착수할 수 있습니다.',
  NOT_ACTIVE: '경기가 진행 중일 때만 착수할 수 있습니다.',
  NOT_WAITING: '준비할 수 있는 대기 상태가 아닙니다. 현재 방 상태를 확인해 주세요.',
  ROOM_PAUSED: '연결이 끊겨 경기가 멈췄습니다. 두 사람이 돌아오면 다시 시작합니다.',
  OCCUPIED: '이미 기물이 있는 자리입니다. 배치는 빈 교차점에 해 주세요.',
  NO_SUPPLY: '이 기물은 공급처에 없습니다. 다른 기물을 선택해 주세요.',
  NO_FOOD: '식량이 부족합니다. 군사를 배치해 식량을 모아 주세요.',
  INVALID_MOVE: '그곳으로 이동할 수 없습니다. 표시된 목적지를 선택해 주세요.',
  PROTECTED: '완성된 줄의 다섯 기물은 이동하거나 포획할 수 없습니다.',
  OUT_OF_BOUNDS: '보드 안의 교차점을 선택해 주세요.',
  INVALID_LINES: '보호 구간을 다시 선택해 주세요. 같은 직선의 겹친 줄은 중복 득점할 수 없습니다.',
  LINES_REQUIRED: '추가로 인정할 수 있는 보호 구간을 모두 선택해 주세요.',
  COMMAND_ID_REUSED: '요청 식별자가 충돌했습니다. 최신 보드를 확인하고 다시 선택해 주세요.',
  TURN_TIMEOUT: '착수 시간이 끝났습니다. 서버의 경기 결과를 기다려 주세요.',
  STORAGE_ERROR: '브라우저에 미확정 요청을 보관할 수 없어 전송하지 않았습니다. 저장 공간과 개인정보 보호 설정을 확인해 주세요.',
};
export function errorText(code: string): string { return errors[code] ?? `요청을 처리하지 못했습니다 (${code}). 현재 상태를 확인한 뒤 다시 시도해 주세요.`; }
export function actionLabel(action: Action, size: BoardSize = SIZE): string {
  if (action.type === 'moveChess') return `${cellLabel(action.from, size)} → ${cellLabel(action.to, size)} 이동 · 식량 2 사용`;
  return `${cellLabel(action.at, size)} ${action.type === 'placeSoldier' ? '군사 배치 · 식량 1 획득 (최대 5)' : `${pieceName[action.kind]} 배치 · 식량 3 사용`}`;
}
