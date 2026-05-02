/**
 * Highlight renderer — selectedEntityIds'a gore mavi vurgu.
 *
 * Equipment butunsel selection: bir block sub-entity'sine tikla → tum
 * grup id'leri selectedEntityIds'a yazilir (Worker.pick group_entity_ids
 * doner) → bu renderer hepsini birden mavi cizer.
 *
 * Y-flip: yToScreen(y) her vertex'te.
 */

import { Container, Graphics } from 'pixi.js';
import type { GeometryArc, GeometryCircle, GeometryInsert, GeometryLine, GeometryText } from '../types';
import { yToScreen } from './sceneGraph';
import { cssToHex } from './color';

const COLOR_HIGHLIGHT = cssToHex('#60a5fa');
const HIGHLIGHT_WIDTH = 2.5;

export interface HighlightRendererOpts {
  lines: GeometryLine[];
  circles: GeometryCircle[];
  arcs: GeometryArc[];
  inserts: GeometryInsert[];
  texts: GeometryText[];
}

export interface HighlightRendererHandle {
  setSelected(entityIds: Set<string>): void;
  destroy(): void;
}

export function createHighlightRenderer(
  parent: Container,
  opts: HighlightRendererOpts,
): HighlightRendererHandle {
  const { lines, circles, arcs, inserts, texts } = opts;
  const g = new Graphics();
  g.label = 'highlight';
  parent.addChild(g);

  function setSelected(entityIds: Set<string>) {
    g.clear();
    if (entityIds.size === 0) return;

    const idArr: string[] = [];
    entityIds.forEach((id) => idArr.push(id));
    for (const id of idArr) {
      const dotIdx = id.indexOf('.');
      if (dotIdx < 0) continue;
      const type = id.slice(0, dotIdx);
      const idx = Number(id.slice(dotIdx + 1));
      if (!Number.isFinite(idx)) continue;

      switch (type) {
        case 'line': {
          const ln = lines[idx];
          if (!ln) continue;
          const [x1, y1, x2, y2] = ln.coords;
          g.moveTo(x1, yToScreen(y1));
          g.lineTo(x2, yToScreen(y2));
          break;
        }
        case 'circle': {
          const c = circles[idx];
          if (!c) continue;
          g.circle(c.center[0], yToScreen(c.center[1]), c.radius + 0.5);
          break;
        }
        case 'arc': {
          const a = arcs[idx];
          if (!a) continue;
          const sa = (-a.start_angle * Math.PI) / 180;
          const ea = (-a.end_angle * Math.PI) / 180;
          g.moveTo(
            a.center[0] + a.radius * Math.cos(ea),
            yToScreen(a.center[1]) + a.radius * Math.sin(ea),
          );
          g.arc(a.center[0], yToScreen(a.center[1]), a.radius, ea, sa);
          break;
        }
        case 'insert': {
          const ins = inserts[idx];
          if (!ins) continue;
          // Equipment center'a halka vurgu
          g.circle(ins.position[0], yToScreen(ins.position[1]), 5);
          break;
        }
        case 'text': {
          const t = texts[idx];
          if (!t) continue;
          // Text bbox'i kabaca cizgi
          const h = Math.max(t.height, 0.5);
          const w = Math.max(t.text.length * h * 0.6, h);
          g.rect(t.position[0] - h * 0.2, yToScreen(t.position[1]) - h * 1.2, w, h * 1.4);
          break;
        }
      }
    }
    g.stroke({ width: HIGHLIGHT_WIDTH, color: COLOR_HIGHLIGHT });
  }

  function destroy() {
    g.destroy();
  }

  return { setSelected, destroy };
}
