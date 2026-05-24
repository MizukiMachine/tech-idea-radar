import { describe, expect, it } from 'vitest';
import { compactTargetUsers } from '../utils/target-users';

describe('compactTargetUsers', () => {
  it('keeps already concise target user labels', () => {
    expect(compactTargetUsers('小規模な SRE チーム')).toBe('小規模な SRE チーム');
    expect(compactTargetUsers('オープンソースプロジェクトのメンテナ')).toBe('オープンソースプロジェクトのメンテナ');
  });

  it('extracts the target actor from legacy condition-like target text', () => {
    expect(compactTargetUsers('AIを導入したいが専任AIチームを持たずPoC評価に悩むDX担当者')).toBe('DX担当者');
    expect(compactTargetUsers('10〜50チーム規模の組織で')).toBe('10〜50チーム規模の組織');
    expect(compactTargetUsers('エンジン間の移行を検討中のインディーゲーム開発者')).toBe('インディーゲーム開発者');
  });

  it('uses readable fallbacks when legacy text describes tool adoption instead of users', () => {
    expect(compactTargetUsers('AIコーディングアシスタントを導入済みだが')).toBe('AI開発チーム');
    expect(compactTargetUsers('AIコーディングエージェントを組織導入している企業')).toBe('AI開発チーム');
    expect(compactTargetUsers('AIコーディングエージェントをチームに導入している開発組織')).toBe('AI開発チーム');
    expect(compactTargetUsers('CopilotやCursorなどのAIコーディングツールを使う開発者')).toBe('開発者');
  });
});
