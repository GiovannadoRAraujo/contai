import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart,
  Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { brl, num } from '@/lib/format';
import { corCategoria } from '@/lib/categorias';
import { useApp } from '@/store/app';

const EIXO = { fill: '#697795', fontSize: 11 };
const GRADE = '#182341';

function Caixa({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-line bg-card px-3 py-2 shadow-glow">
      {children}
    </div>
  );
}

const abreviar = (v: number) => (Math.abs(v) >= 1000 ? `${num(v / 1000, 0)}k` : num(v, 0));

/* ----------------------- Despesas por categoria ----------------------- */
export function Rosca({
  dados, total, rotuloCentro = 'Total de despesas', altura = 190,
}: {
  dados: Array<{ categoria: string; valor: number; pct: number }>;
  total: number;
  rotuloCentro?: string;
  altura?: number;
}) {
  const { estado } = useApp();
  const oculto = estado.usuario.ocultarValores;
  const compacto = altura <= 150;

  return (
    <div className="flex w-full min-w-0 flex-col items-center gap-4 sm:flex-row sm:gap-3">
      <div className="relative shrink-0" style={{ width: altura, height: altura }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={dados}
              dataKey="valor"
              nameKey="categoria"
              innerRadius="66%"
              outerRadius="100%"
              paddingAngle={2}
              stroke="none"
              startAngle={90}
              endAngle={-270}
              isAnimationActive
            >
              {dados.map((d) => (
                <Cell key={d.categoria} fill={corCategoria(d.categoria)} />
              ))}
            </Pie>
            <Tooltip
              content={({ payload }) =>
                payload?.[0] ? (
                  <Caixa>
                    <p className="text-[12px] font-semibold text-txt">{payload[0].name}</p>
                    <p className="text-[12px] text-txt2">
                      {oculto ? 'R$ ••••' : brl(Number(payload[0].value))} · {num((payload[0].payload as { pct: number }).pct, 1)}%
                    </p>
                  </Caixa>
                ) : null
              }
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 grid place-items-center px-2 text-center">
          <div className="w-full">
            <p className={`font-bold leading-tight text-txt ${compacto ? 'text-[12.5px]' : 'text-[17px]'}`}>
              {oculto ? 'R$ ••••' : brl(total)}
            </p>
            <p className={`mt-0.5 leading-tight text-txt3 ${compacto ? 'text-[9px]' : 'text-[10.5px]'}`}>{rotuloCentro}</p>
          </div>
        </div>
      </div>

      <ul className={`w-full min-w-0 flex-1 ${compacto ? 'space-y-[5px]' : 'space-y-[7px]'}`}>
        {dados.map((d) => (
          <li key={d.categoria} className={`flex items-center gap-2 ${compacto ? 'text-[11.5px]' : 'text-[12.5px]'}`}>
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: corCategoria(d.categoria) }} />
            <span className="min-w-0 flex-1 truncate text-txt2">{d.categoria}</span>
            <span className="shrink-0 font-semibold text-txt">{num(d.pct, 0)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ------------------------ Receitas x Despesas ------------------------ */
export function BarrasComparativo({
  dados, altura = 210,
}: { dados: Array<{ mes: string; receitas: number; despesas: number }>; altura?: number }) {
  return (
    <ResponsiveContainer width="100%" height={altura}>
      <BarChart data={dados} margin={{ top: 4, right: 4, left: -18, bottom: 0 }} barGap={6}>
        <CartesianGrid stroke={GRADE} vertical={false} />
        <XAxis dataKey="mes" tick={EIXO} axisLine={false} tickLine={false} />
        <YAxis tick={EIXO} axisLine={false} tickLine={false} tickFormatter={abreviar} width={48} />
        <Tooltip
          cursor={{ fill: 'rgba(124,58,237,.08)' }}
          content={({ payload, label }) =>
            payload?.length ? (
              <Caixa>
                <p className="mb-1 text-[12px] font-semibold text-txt">{label}</p>
                {payload.map((p) => (
                  <p key={String(p.dataKey)} className="text-[12px]" style={{ color: p.color }}>
                    {p.dataKey === 'receitas' ? 'Receitas' : 'Despesas'}: {brl(Number(p.value))}
                  </p>
                ))}
              </Caixa>
            ) : null
          }
        />
        <Legend
          verticalAlign="top"
          align="right"
          height={28}
          iconType="circle"
          iconSize={8}
          formatter={(v) => <span className="text-[11.5px] text-txt2">{v === 'receitas' ? 'Receitas' : 'Despesas'}</span>}
        />
        <Bar dataKey="receitas" fill="#27D9D0" radius={[4, 4, 0, 0]} maxBarSize={22} />
        <Bar dataKey="despesas" fill="#F052A0" radius={[4, 4, 0, 0]} maxBarSize={22} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/* --------------------------- Evolução do saldo --------------------------- */
export function LinhaSaldo({
  dados, altura = 170, chave = 'saldo', cor = '#A855F7',
}: { dados: Array<Record<string, unknown>>; altura?: number; chave?: string; cor?: string }) {
  const id = `grad-${chave}-${cor.replace('#', '')}`;
  return (
    <ResponsiveContainer width="100%" height={altura}>
      <AreaChart data={dados} margin={{ top: 8, right: 6, left: -22, bottom: 0 }}>
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={cor} stopOpacity={0.45} />
            <stop offset="100%" stopColor={cor} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={GRADE} vertical={false} />
        <XAxis dataKey="mes" tick={EIXO} axisLine={false} tickLine={false} />
        <YAxis tick={EIXO} axisLine={false} tickLine={false} tickFormatter={abreviar} width={48} />
        <Tooltip
          cursor={{ stroke: cor, strokeDasharray: '4 4' }}
          content={({ payload, label }) =>
            payload?.[0] ? (
              <Caixa>
                <p className="text-[12px] font-semibold text-txt">{label}</p>
                <p className="text-[12px]" style={{ color: cor }}>{brl(Number(payload[0].value))}</p>
              </Caixa>
            ) : null
          }
        />
        <Area
          type="monotone"
          dataKey={chave}
          stroke={cor}
          strokeWidth={2.4}
          fill={`url(#${id})`}
          dot={{ r: 3, fill: cor, stroke: '#0B1228', strokeWidth: 2 }}
          activeDot={{ r: 5 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/* ------------------------- Mini gráfico de área ------------------------- */
export function MiniArea({ dados, cor = '#A855F7', altura = 90 }: { dados: Array<{ v: number }>; cor?: string; altura?: number }) {
  const id = `mini-${cor.replace('#', '')}`;
  return (
    <ResponsiveContainer width="100%" height={altura}>
      <AreaChart data={dados} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={cor} stopOpacity={0.5} />
            <stop offset="100%" stopColor={cor} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area type="monotone" dataKey="v" stroke={cor} strokeWidth={2} fill={`url(#${id})`} dot={false} isAnimationActive />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/* ----------------------- Projeção do simulador ----------------------- */
export function BarrasProjecao({
  dados, altura = 150,
}: { dados: Array<{ rotulo: string; bruto: number; aportado: number }>; altura?: number }) {
  return (
    <ResponsiveContainer width="100%" height={altura}>
      <BarChart data={dados} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
        <CartesianGrid stroke={GRADE} vertical={false} />
        <XAxis dataKey="rotulo" tick={{ ...EIXO, fontSize: 10 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
        <YAxis tick={EIXO} axisLine={false} tickLine={false} tickFormatter={abreviar} width={46} />
        <Tooltip
          cursor={{ fill: 'rgba(124,58,237,.08)' }}
          content={({ payload, label }) =>
            payload?.[0] ? (
              <Caixa>
                <p className="text-[12px] font-semibold text-txt">{label}</p>
                <p className="text-[12px] text-roxo-luz">Acumulado: {brl(Number(payload[0].value))}</p>
                <p className="text-[12px] text-txt2">Aportado: {brl(Number((payload[0].payload as { aportado: number }).aportado))}</p>
              </Caixa>
            ) : null
          }
        />
        <Bar dataKey="bruto" radius={[4, 4, 0, 0]} maxBarSize={18}>
          {dados.map((_, i) => (
            <Cell key={i} fill={i === dados.length - 1 ? '#A855F7' : '#7C3AED'} fillOpacity={0.45 + (i / Math.max(1, dados.length)) * 0.55} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/* --------------------------- Linha simples --------------------------- */
export function LinhaSimples({ dados, cor = '#27D9D0', altura = 120 }: { dados: Array<{ x: string; y: number }>; cor?: string; altura?: number }) {
  return (
    <ResponsiveContainer width="100%" height={altura}>
      <LineChart data={dados} margin={{ top: 6, right: 6, left: -24, bottom: 0 }}>
        <CartesianGrid stroke={GRADE} vertical={false} />
        <XAxis dataKey="x" tick={EIXO} axisLine={false} tickLine={false} />
        <YAxis tick={EIXO} axisLine={false} tickLine={false} tickFormatter={abreviar} width={46} />
        <Tooltip content={({ payload, label }) => payload?.[0] ? (
          <Caixa>
            <p className="text-[12px] font-semibold text-txt">{label}</p>
            <p className="text-[12px]" style={{ color: cor }}>{brl(Number(payload[0].value))}</p>
          </Caixa>
        ) : null} />
        <Line type="monotone" dataKey="y" stroke={cor} strokeWidth={2.2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}
