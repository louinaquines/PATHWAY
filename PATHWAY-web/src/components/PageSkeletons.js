// src/components/PageSkeletons.js
const Bar = ({ w, h = 12, r = 6 }) => <span className="cdash-skel" style={{ width: w, height: h, borderRadius: r, display: 'block' }} />;

export function LogbookSkeleton() {
  return <div className="pskel" aria-busy="true" aria-label="Loading attendance and journals">
    <div className="pskel-card">
      <div className="pskel-toolbar"><Bar w={220} h={44} r={10} /><Bar w="100%" h={44} r={10} /></div>
      <div className="pskel-head">{[70, 100, 90, 80].map((w, i) => <Bar key={i} w={w} h={10} />)}</div>
      <LogbookRows />
    </div>
  </div>;
}

export function LogbookRows({ count = 7 }) {
  return <>{Array.from({ length: count }, (_, key) => <div key={key} className="logbook-skel-row"><Bar w={70} /><span className="logbook-skel-person"><Bar w={32} h={32} r={99} /><Bar w={140} h={13} /></span><Bar w={150} h={28} r={99} /><Bar w={150} h={28} r={99} /></div>)}</>;
}

export function JournalEntriesSkeleton() {
  return <div className="pskel-journals" role="status" aria-label="Loading journal entries">
    {[0, 1, 2].map(key => <div key={key} className="pskel-journal">
      <div className="pskel-row-between"><div className="pskel-stack"><Bar w={160} h={14} /><Bar w={220} h={11} /></div><Bar w={80} h={24} r={99} /></div>
      <Bar w="100%" /><Bar w="92%" /><Bar w="60%" />
    </div>)}
  </div>;
}

export function EvaluationSkeleton() {
  return <div className="pskel" aria-busy="true" aria-label="Loading supervisor evaluations">
    <div className="pskel-card pskel-pad">
      <div className="pskel-stack"><Bar w={220} h={18} /><Bar w={320} h={11} /></div>
      <Bar w={260} h={36} r={10} />
      <div className="pskel-fields">{[0, 1, 2].map(key => <div key={key} className="pskel-stack"><Bar w={90} h={10} /><Bar w="100%" h={42} r={10} /></div>)}</div>
      <Bar w={180} h={40} r={10} />
    </div>
    <div className="pskel-card pskel-pad">
      <div className="pskel-row-between"><div className="pskel-stack"><Bar w={180} h={16} /><Bar w={90} h={11} /></div><Bar w={240} h={40} r={10} /></div>
      <div className="pskel-grid">{[0, 1, 2, 3, 4, 5].map(key => <div key={key} className="pskel-eval">
        <div className="pskel-row-between"><Bar w={140} h={14} /><Bar w={90} h={22} r={99} /></div>
        <Bar w="70%" h={11} /><Bar w="90%" h={11} /><Bar w={120} h={32} r={8} />
      </div>)}</div>
    </div>
  </div>;
}
