import { LEVELS } from "./factory-model.mjs";

type Props = {
  unlockedLevel: number;
  activeLevel: number;
  bestResults: Record<number, { elapsed: number; completed: number }>;
  onSelect: (levelId: number) => void;
  onClose: () => void;
};

const levelIds = Object.keys(LEVELS).map(Number).sort((a, b) => a - b);

export function LevelSelectModal({
  unlockedLevel,
  activeLevel,
  bestResults,
  onSelect,
  onClose,
}: Props) {
  return (
    <div className="level-select-backdrop" role="dialog" aria-modal="true" aria-labelledby="level-select-title">
      <section className="level-select-card">
        <button className="level-select-close" type="button" aria-label="关闭关卡选择" onClick={onClose} autoFocus>×</button>
        <span className="level-select-kicker">CHAPTER ONE</span>
        <h2 id="level-select-title">章节关卡</h2>
        <p>从一条教学产线开始，最后把整座小工厂逼到极限。很合理，也很残酷。</p>
        <div className="level-select-grid">
          {levelIds.map((levelId) => {
            const level = LEVELS[levelId];
            const locked = levelId > unlockedLevel;
            const active = levelId === activeLevel;
            const bestResult = bestResults[levelId];
            return (
              <button
                key={levelId}
                className={`level-option ${active ? "level-option--active" : ""} ${locked ? "level-option--locked" : ""}`}
                type="button"
                disabled={locked}
                onClick={() => onSelect(levelId)}
              >
                <span className="level-option__number">{`第 ${levelId} 关`}</span>
                <strong>{level.name}</strong>
                <small>{level.duration} 秒内完成 {level.target} 个合格螺栓</small>
                {bestResult && <small className="level-option__record">最佳纪录 {bestResult.elapsed.toFixed(1)} 秒</small>}
                <em>{locked ? "🔒 尚未解锁" : active ? "当前关卡" : "进入关卡 →"}</em>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}
