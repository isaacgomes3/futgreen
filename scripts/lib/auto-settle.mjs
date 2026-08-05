/**
 * auto-settle-v1
 * Pedido explícito do dono (2026-08-04): liquidação automática de Proteção e Desafio
 * quando a fonte de placar confirma "finished" (score_source presente + finished_at + placar numérico).
 *
 * Regra de segurança: só liquida quando o mercado é reconhecível com confiança
 * (1X2/vencedor, DNB/Empate Anula, Total de gols Mais/Menos X.X). Qualquer mercado
 * não reconhecido é IGNORADO (fica para o admin liquidar manualmente — nunca adivinha).
 * Reaproveita 100% das funções de liquidação já existentes (settleProtection/settleDesafioStep):
 * nenhuma regra financeira nova é criada aqui, só a decisão automática do outcome a partir do placar.
 */

import { settleProtection } from './settle-protection.mjs';
import { settleDesafioStep } from './desafio-ops.mjs';
import { PROTECTION_OUTCOMES } from './protection-flow-contract.mjs';

/** true = seleção aconteceu · false = não aconteceu · 'push' = empate exato (linha cheia) · null = mercado não reconhecido */
export function evaluateSelectionOutcome(match, homeScore, awayScore) {
  const hs = Number(homeScore);
  const as = Number(awayScore);
  if (!Number.isFinite(hs) || !Number.isFinite(as)) return null;

  const sel = String(match?.selection_name || '').trim();
  const mkt = String(match?.market_name || '').trim();
  const selLower = sel.toLowerCase();
  const mktLower = mkt.toLowerCase();
  const total = hs + as;

  // Total de gols — Mais/Menos (Over/Under) X.X
  const ouMatch = `${selLower} ${mktLower}`.match(/(mais|menos|over|under)\D{0,6}(\d+(?:[.,]\d+)?)/);
  if (ouMatch) {
    const threshold = Number(ouMatch[2].replace(',', '.'));
    if (Number.isFinite(threshold)) {
      const isOver = /mais|over/.test(ouMatch[1]);
      if (total === threshold) return 'push';
      return isOver ? total > threshold : total < threshold;
    }
  }

  // 1X2 / vencedor / DNB — por nome do time ou "empate"
  const home = String(match?.home_team || '').trim().toLowerCase();
  const away = String(match?.away_team || '').trim().toLowerCase();
  const isDnb = /dnb|empate anula|draw no bet/.test(mktLower);
  if (selLower && (selLower === home || selLower === away)) {
    if (hs === as) return isDnb ? 'push' : false;
    const winner = hs > as ? home : away;
    return winner === selLower;
  }
  if (/^empate$|draw/.test(selLower)) {
    return hs === as;
  }

  return null;
}

/** Resolve outcome de Proteção (reembolso/ganho/anula) a partir do placar — null = não reconhecido, pula */
export function resolveProtectionOutcome(match, homeScore, awayScore) {
  const result = evaluateSelectionOutcome(match, homeScore, awayScore);
  if (result == null) return null;
  if (result === 'push') return PROTECTION_OUTCOMES.ANULA;
  const sideU = String(match?.side || 'LAY').toUpperCase();
  const selectionWon = sideU === 'BACK' ? result === true : result === false;
  return selectionWon ? PROTECTION_OUTCOMES.GANHO : PROTECTION_OUTCOMES.REEMBOLSO;
}

/** Palpite inicial de winningSide para o Desafio (o void por empate DNB já é resolvido dentro de settleDesafioStep) */
export function resolveDesafioWinningSideGuess(step, homeScore, awayScore) {
  const hs = Number(homeScore);
  const as = Number(awayScore);
  if (!Number.isFinite(hs) || !Number.isFinite(as)) return null;
  if (hs === as) return 'casa'; // empate: se for DNB, resolveDesafioMarketResult troca para void
  const winner = hs > as ? 'home' : 'away';
  return winner === step?.bet_team_side ? 'futgreen' : 'casa';
}

function hasConfirmedScore(record) {
  return (
    Boolean(record?.score_source) &&
    record?.finished_at != null &&
    Number.isFinite(Number(record?.home_score)) &&
    Number.isFinite(Number(record?.away_score))
  );
}

/**
 * Varre matches/desafio_steps com placar confirmado por fonte externa e ainda não
 * liquidados, e liquida automaticamente quando o mercado é reconhecido com confiança.
 * Idempotente/seguro: settleProtection e settleDesafioStep ignoram registros já liquidados.
 */
export function runAutoSettle(store, { adminEmail = 'system:auto-settle' } = {}) {
  const settledMatches = [];
  const settledSteps = [];
  const skipped = [];

  for (const m of store.data.matches || []) {
    if (m.settled_at || !hasConfirmedScore(m)) continue;
    const activeProts = (store.data.protections || []).filter((p) => p.match_id === m.id && p.status === 'active');
    if (!activeProts.length) continue;
    const outcome = resolveProtectionOutcome(m, m.home_score, m.away_score);
    if (!outcome) {
      skipped.push({ kind: 'match', id: m.id, reason: 'mercado não reconhecido' });
      continue;
    }
    try {
      m.settled_at = new Date().toISOString();
      m.is_published = false;
      for (const p of activeProts) {
        settleProtection(store, { protectionId: p.id, outcome, adminEmail });
      }
      settledMatches.push({ match_id: m.id, outcome });
    } catch {
      // corrida com liquidação manual do admin — ignora, admin já resolveu
    }
  }

  for (const step of store.data.desafio_steps || []) {
    if (step.status === 'done' || !hasConfirmedScore(step)) continue;
    const guess = resolveDesafioWinningSideGuess(step, step.home_score, step.away_score);
    if (!guess) {
      skipped.push({ kind: 'desafio_step', id: step.id, reason: 'placar indisponível' });
      continue;
    }
    try {
      settleDesafioStep(store, {
        stepId: step.id,
        winningSide: guess,
        homeScore: step.home_score,
        awayScore: step.away_score,
        adminEmail,
      });
      settledSteps.push({ step_id: step.id, winningSide: guess });
    } catch {
      // corrida com liquidação manual do admin — ignora
    }
  }

  if (settledMatches.length || settledSteps.length) store.save();
  return { settledMatches, settledSteps, skipped };
}
