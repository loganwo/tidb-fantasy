/* =========================================================
 * dragSystem.js —— 拖拽迁移系统（方案2.2：拖拽即时反馈）
 * 按住副本块拖到目标节点；短按视为选中分片。
 * ========================================================= */
'use strict';

class DragSystem {
  constructor(scene, renderer, app) {
    this.scene = scene;
    this.renderer = renderer;
    this.app = app;
    this.drag = null;
    this.downPt = null;

    scene.input.on('pointerdown', p => this.onDown(p));
    scene.input.on('pointermove', p => this.onMove(p));
    scene.input.on('pointerup', p => this.onUp(p));
  }

  onDown(p) {
    if (this.app.core.status !== 'playing') return;
    // 先判敌军：点敌军=挥锤砍杀
    const foe = this.renderer.hitEnemy && this.renderer.hitEnemy(p.x, p.y);
    if (foe) {
      const res = this.app.es.strike(foe.tikv);
      if (res.ok) {
        SFX.play('split');
        this.scene.cameras.main.shake(90, 0.003);
        if (res.killed) HUD.floatText('⚔️ 阵斩！', '#c0392b');
      }
      return;
    }
    const hit = this.renderer.pickReplica(p.x, p.y);
    this.downPt = { x: p.x, y: p.y };
    if (hit) {
      this.drag = { regionId: hit.regionId, fromTikv: hit.tikvId, moved: false };
      this.renderer.makeGhost(hit.regionId, p.x, p.y);
    }
  }

  onMove(p) {
    if (!this.drag) return;
    if (!this.drag.moved &&
        Phaser.Math.Distance.Between(this.downPt.x, this.downPt.y, p.x, p.y) > 8) {
      this.drag.moved = true;
      SFX.play('select');
    }
    if (!this.drag.moved) return;
    this.renderer.moveGhost(p.x, p.y);
    const t = this.renderer.pickNode(p.x, p.y);
    if (t != null) {
      const c = this.app.core.canMigrate(this.drag.regionId, this.drag.fromTikv, t);
      this.renderer.highlightNode(t, c.ok);
    } else {
      this.renderer.clearHighlight();
    }
  }

  onUp(p) {
    if (!this.drag) return;
    const d = this.drag;
    this.drag = null;
    const t = this.renderer.pickNode(p.x, p.y);
    this.renderer.dropGhost();
    this.renderer.clearHighlight();

    // 短按 = 选中分片
    if (!d.moved) {
      this.renderer.selectRegion(d.regionId);
      this.app.onSelectRegion(d.regionId);
      return;
    }
    // 松开瞬间：负载刷新、算力扣减、风险重算（core.migrate 内完成）
    if (t != null) {
      const res = this.app.core.migrate(d.regionId, d.fromTikv, t);
      if (res.ok) {
        SFX.play('migrate');
        this.renderer.selectRegion(d.regionId);
        this.app.onSelectRegion(d.regionId);
        // 围攻/预警中把最后一座仓搬走 = 白送一座城，必须当场说清楚
        const es = this.app.es;
        if (es && (es.isSiege(d.fromTikv) || es.isWarning(d.fromTikv)) && es.cityStock(d.fromTikv) === 0) {
          this.app.toast(`⚠️ ${CITY.name(d.fromTikv)}已被搬空！敌军兵临城下的空城会被不战而取——至少留 1 座仓守城！`, 'bad');
        }
      } else if (res.reason) {
        SFX.play('deny');
        this.app.toast(res.reason, 'bad');
      }
    }
  }
}
