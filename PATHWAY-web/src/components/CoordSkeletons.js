// Loading skeletons that mirror the redesigned coordinator screens (white cards on the page background).
import './CoordSkeletons.css';

const Bar = ({ w = '100%', h = 12, r = 6, style }) => <span className="cdash-skel csk-bar" style={{ width: w, height: h, borderRadius: r, ...style }} />;

function Toolbar({ chips = 3, search = true, bell = true }) {
  return <div className="csk-toolbar">
    <div className="csk-chips">{Array.from({ length: chips }, (_, i) => <Bar key={i} w={i === 0 ? 58 : 96} h={34} r={99} />)}</div>
    <div className="csk-tools">{search && <Bar w={260} h={44} r={10} />}{bell && <Bar w={44} h={44} r={10} />}</div>
  </div>;
}

function Pager({ label = true }) {
  return <div className="csk-pager">{label && <Bar w={90} h={12} />}<Bar w={170} h={40} r={12} /></div>;
}

function PersonRow({ cols = 2 }) {
  return <div className="csk-row">
    <Bar w={40} h={40} r={99} />
    <div className="csk-lines"><Bar w="55%" h={14} /><Bar w="38%" h={11} /></div>
    {cols > 1 && <Bar w={120} h={26} r={99} />}
    {cols > 2 && <Bar w={90} h={12} />}
    <Bar w={86} h={36} r={10} />
  </div>;
}

function TableRow() {
  return <div className="csk-row csk-table">
    <span className="csk-person"><Bar w={36} h={36} r={99} /><span className="csk-lines"><Bar w={140} h={13} /><Bar w={100} h={10} /></span></span>
    <Bar w={70} h={12} /><Bar w={90} h={12} /><Bar w={80} h={12} /><Bar w={96} h={24} r={99} /><Bar w={120} h={36} r={10} />
  </div>;
}

// Toolbar + rows + pager in one white card, with an optional right-hand summary card.
export function ListSkeleton({ label = 'Loading', chips = 3, rows = 8, side = false, table = false }) {
  return <div className={`csk ${side ? 'csk-with-side' : ''}`} role="status" aria-busy="true" aria-label={label}>
    <div className="csk-card">
      <Toolbar chips={chips} />
      {table && <div className="csk-head">{[90, 80, 60, 80, 60].map((w, i) => <Bar key={i} w={w} h={10} />)}</div>}
      <div className="csk-rows">{Array.from({ length: rows }, (_, i) => table ? <TableRow key={i} /> : <PersonRow key={i} cols={3} />)}</div>
      <Pager />
    </div>
    {side && <div className="csk-side">
      <div className="csk-card csk-pad"><Bar w="60%" h={16} /><Bar w="40%" h={11} />{[0, 1, 2, 3, 4].map(i => <div key={i} className="csk-stack"><div className="csk-between"><Bar w="45%" h={12} /><Bar w={28} h={12} /></div><Bar w="100%" h={6} r={3} /></div>)}</div>
      <div className="csk-card csk-pad csk-soft"><Bar w="50%" h={14} /><Bar w="95%" h={11} /><Bar w="80%" h={11} /></div>
    </div>}
  </div>;
}

// Left list (search, colour chips, students, pager) + right detail (name, progress, phase tabs, document rows).
export function SplitSkeleton({ label = 'Loading', inbox = false }) {
  return <div className="csk csk-split" role="status" aria-busy="true" aria-label={label}>
    <div className="csk-card csk-left">
      <div className="csk-tools"><Bar w="100%" h={44} r={10} /><Bar w={44} h={44} r={10} />{!inbox && <Bar w={44} h={44} r={10} />}</div>
      {!inbox && <div className="csk-chips">{[0, 1, 2].map(i => <Bar key={i} w={78} h={30} r={99} />)}</div>}
      {inbox && <div className="csk-chips">{[0, 1, 2].map(i => <Bar key={i} w={88} h={30} r={99} />)}</div>}
      <div className="csk-rows">{Array.from({ length: 7 }, (_, i) => <div key={i} className="csk-row csk-mini"><Bar w={40} h={40} r={99} /><div className="csk-lines"><Bar w="70%" h={13} /><Bar w="40%" h={10} /></div><Bar w={70} h={11} /></div>)}</div>
      <Pager />
    </div>
    <div className="csk-card csk-pad csk-right">
      <div className="csk-between"><div className="csk-stack"><Bar w={220} h={24} /><Bar w={260} h={12} /></div><Bar w={130} h={40} r={10} /></div>
      {!inbox && <Bar w="100%" h={8} r={4} />}
      {!inbox && <Bar w="100%" h={50} r={12} />}
      {Array.from({ length: inbox ? 6 : 5 }, (_, i) => <div key={i} className="csk-row csk-doc"><div className="csk-lines"><Bar w="60%" h={14} /><Bar w="45%" h={11} /></div><Bar w={90} h={26} r={99} /><Bar w={80} h={12} /></div>)}
    </div>
  </div>;
}

// Sections: search + section cards on the left; section header, tabs, search and student table on the right.
export function SectionsSkeleton() {
  return <div className="csk csk-sections" role="status" aria-busy="true" aria-label="Loading sections">
    <div className="csk-stack"><Bar w="100%" h={44} r={10} />{[0, 1].map(i => <div key={i} className="csk-card csk-pad"><Bar w="55%" h={16} /><Bar w="70%" h={11} /></div>)}</div>
    <div className="csk-card csk-pad">
      <div className="csk-stack"><Bar w={180} h={26} /><Bar w={320} h={12} /></div>
      <Bar w="100%" h={52} r={12} />
      <Bar w={320} h={44} r={10} />
      <div className="csk-head">{[80, 120, 120, 100].map((w, i) => <Bar key={i} w={w} h={10} />)}</div>
      {Array.from({ length: 8 }, (_, i) => <div key={i} className="csk-row csk-table4"><Bar w={80} h={12} /><Bar w={150} h={13} /><Bar w={140} h={12} /><Bar w={90} h={24} r={99} /></div>)}
    </div>
  </div>;
}

// Progress: hours chart card with an attendance side panel.
export function ProgressSkeleton() {
  return <div className="csk csk-with-side" role="status" aria-busy="true" aria-label="Loading progress">
    <div className="csk-card csk-pad">
      <div className="csk-between"><div className="csk-stack"><Bar w={260} h={18} /><Bar w={200} h={11} /></div><Bar w={120} h={38} r={10} /></div>
      <div className="csk-chart">{[62, 40, 85, 30, 55, 70, 20, 90, 45, 66, 35, 78].map((h, i) => <Bar key={i} w="100%" h={`${h}%`} r={6} />)}</div>
      <Pager label={false} />
    </div>
    <div className="csk-side"><div className="csk-card csk-pad"><Bar w="55%" h={16} />{[0, 1, 2, 3, 4, 5].map(i => <div key={i} className="csk-row csk-mini"><Bar w={34} h={34} r={99} /><div className="csk-lines"><Bar w="65%" h={12} /><Bar w="40%" h={10} /></div><Bar w={54} h={22} r={99} /></div>)}</div></div>
  </div>;
}

// Rows only, for lists that load inside an existing card.
export function RowsSkeleton({ label = 'Loading', rows = 6, action = true }) {
  return <div className="csk-rows csk-inline" role="status" aria-busy="true" aria-label={label}>
    {Array.from({ length: rows }, (_, i) => <div key={i} className="csk-row"><Bar w={40} h={40} r={99} /><div className="csk-lines"><Bar w="50%" h={14} /><Bar w="35%" h={11} /></div><Bar w={110} h={24} r={99} />{action && <Bar w={86} h={34} r={10} />}</div>)}
  </div>;
}
