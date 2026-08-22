import { LEVELS } from "./factory-model.mjs";

type Props = {
  unlockedLevel: number;
  activeLevel: number;
  bestResults: Record<number, { elapsed: number; completed: number }>;
  onSelect: (levelId: number) => void;
  onClose: () => void;
};

const levelIds = Object.keys(LEVELS).map(Number).sort((a, b) => a - b);
const chapters = [
  { id: 1, title: "第一章：产线基础", levelIds: levelIds.filter((levelId) => levelId <= 5) },
  { id: 2, title: "第二章：订单调度", levelIds: levelIds.filter((levelId) => levelId >= 6) },
] as const;

function levelDetail(levelId: number) {
  const level = LEVELS[levelId];
  if (level.chapter === 2 && level.orderConfig) {
    const [minimumLead, maximumLead] = level.orderConfig.deadlineLeadWindow;
    return `${level.orderConfig.orderCount} 张订单 · 交付窗口 ${minimumLead}–${maximumLead} 秒`;
  }
  return `${level.duration} 秒内完成 ${level.target} 个合格螺栓`;
}

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
        <span className="level-select-kicker">CHAPTER MAP</span>
        <h2 id="level-select-title">章节关卡</h2>
        <p>前五关学会造东西，后五关学会别让订单把你造了。</p>
        <div className="level-select-chapters">
          {chapters.map((chapter) => (
            <section key={chapter.id} className="level-select-chapter" aria-labelledby={`chapter-${chapter.id}-title`}>
              <h3 id={`chapter-${chapter.id}-title`}>{chapter.title}</h3>
              <div className="level-select-grid">
                {chapter.levelIds.map((levelId) => {
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
                      aria-label={`第 ${levelId} 关：${level.name}${locked ? "，尚未解锁" : active ? "，当前关卡" : ""}`}
                      onClick={() => onSelect(levelId)}
                    >
                      <span className="level-option__number">{`第 ${levelId} 关`}</span>
                      <strong>{level.name}</strong>
                      <small>{levelDetail(levelId)}</small>
                      {bestResult && <small className="level-option__record">最佳纪录 {bestResult.elapsed.toFixed(1)} 秒</small>}
                      <em>{locked ? "🔒 尚未解锁" : active ? "当前关卡" : "进入关卡 →"}</em>
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </section>
    </div>
  );
}
