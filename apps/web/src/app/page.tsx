import { getTrendingRepos } from "@/lib/trending-repos";
import { getTopicRanking, getLanguageRanking } from "@/lib/trending-rankings";
import { getRepoDailyGrowth } from "@/lib/trending-growth";
import { BarChart } from "@/components/BarChart";
import {
  getAvailableRankingDates,
  getRepoRanking,
  isRankingMetric,
  isRankingLimit,
  RANKING_METRICS,
  RANKING_METRIC_LABELS,
  RANKING_LIMITS,
  type RankingMetric,
} from "@/lib/repo-ranking";

export const dynamic = "force-dynamic";

const TRENDING_REPOS_LIMIT = 10;

function HighlightCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="card">
      <div className="card-label">{label}</div>
      <div className="card-value">{value}</div>
      {sub && <div className="card-sub">{sub}</div>}
    </div>
  );
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;

  const rankingDates = await getAvailableRankingDates();
  const selectedDate = typeof sp.date === "string" && rankingDates.includes(sp.date)
    ? sp.date
    : rankingDates[0];

  const selectedMetric: RankingMetric =
    typeof sp.metric === "string" && isRankingMetric(sp.metric) ? sp.metric : "total_activity";

  const parsedLimit = typeof sp.limit === "string" ? parseInt(sp.limit, 10) : NaN;
  const selectedLimit = isRankingLimit(parsedLimit) ? parsedLimit : 10;

  const [trendingRepos, topicRanking, languageRanking, ranking] = await Promise.all([
    getTrendingRepos(TRENDING_REPOS_LIMIT),
    getTopicRanking(),
    getLanguageRanking(),
    selectedDate
      ? getRepoRanking(selectedDate, selectedMetric, selectedLimit)
      : Promise.resolve([]),
  ]);

  const topRepo = trendingRepos[0];
  const topTopic = topicRanking[0];
  const topLanguage = languageRanking[0];
  const observedCount = trendingRepos.filter((repo) => repo.observedEvents > 0).length;

  const selectedGrowthRepo =
    typeof sp.growth_repo === "string" && trendingRepos.some((repo) => repo.repoName === sp.growth_repo)
      ? sp.growth_repo
      : topRepo?.repoName;

  const dailyGrowth = selectedGrowthRepo ? await getRepoDailyGrowth(selectedGrowthRepo) : [];

  return (
    <main className="dashboard">
      <header className="dashboard-header">
        <div>
          <h1>분석 결과 조회</h1>
          <p className="subtitle">GitHub 트렌드 / 급상승 레포 분석 결과</p>
        </div>
      </header>

      <section className="stats-grid">
        <HighlightCard
          label="오늘의 1위 레포"
          value={topRepo ? topRepo.repoName : "-"}
          sub={topRepo ? `${topRepo.stars.toLocaleString("ko-KR")} ★` : undefined}
        />
        <HighlightCard
          label="인기 토픽"
          value={topTopic ? topTopic.topic : "-"}
          sub={topTopic ? `${topTopic.repoCount}개 레포에서 언급` : undefined}
        />
        <HighlightCard
          label="인기 언어"
          value={topLanguage ? topLanguage.language : "-"}
          sub={topLanguage ? `${topLanguage.repoCount}개 레포` : undefined}
        />
        <HighlightCard
          label="실시간 활동 확인된 레포"
          value={`${observedCount} / ${trendingRepos.length}`}
          sub="최근 수집된 데이터에서도 활동이 확인됨"
        />
      </section>

      <div className="analysis-grid">
        <section>
          <h2 className="section-title">급상승 레포</h2>
          <p className="section-caption">최근 새로 만들어진 인기 저장소</p>
          {trendingRepos.length === 0 ? (
            <section className="card">
              <p className="empty-state">아직 표시할 급상승 레포 데이터가 없습니다.</p>
            </section>
          ) : (
            <section className="card table-card">
              <table>
                <thead>
                  <tr>
                    <th>Repo</th>
                    <th>Language</th>
                    <th>Star</th>
                    <th>Fork</th>
                    <th>최근 활동</th>
                  </tr>
                </thead>
                <tbody>
                  {trendingRepos.map((repo) => (
                    <tr key={repo.repoName}>
                      <td title={repo.description ?? undefined}>{repo.repoName}</td>
                      <td>{repo.language ?? "-"}</td>
                      <td>{repo.stars}</td>
                      <td>{repo.forks}</td>
                      <td>
                        {repo.observedEvents > 0 ? (
                          <span className="badge badge-success">{repo.observedEvents}건</span>
                        ) : (
                          "-"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}
        </section>

        <section>
          <h2 className="section-title">키워드 / 기술스택</h2>
          <p className="section-caption">급상승 레포에서 자주 보이는 주제와 사용 언어</p>
          <section className="card">
            <div className="card-label">인기 토픽</div>
            {topicRanking.length === 0 ? (
              <p className="empty-state">토픽 데이터가 없습니다.</p>
            ) : (
              <div className="tag-cloud">
                {topicRanking.map((item) => (
                  <span key={item.topic} className="badge badge-neutral">
                    {item.topic} · {item.repoCount}
                  </span>
                ))}
              </div>
            )}

            <div className="card-label card-label-spaced">인기 언어</div>
            {languageRanking.length === 0 ? (
              <p className="empty-state">언어 데이터가 없습니다.</p>
            ) : (
              <div className="tag-cloud">
                {languageRanking.map((item) => (
                  <span key={item.language} className="badge badge-neutral">
                    {item.language} · {item.repoCount}
                  </span>
                ))}
              </div>
            )}
          </section>
        </section>
      </div>

      <h2 className="section-title">일별 성장 추이</h2>
      <p className="section-caption">선택한 레포의 하루 단위 스타/포크 증가량</p>
      <section className="card filter-card">
        <form className="filter-form">
          <div className="field">
            <label htmlFor="growth_repo">레포</label>
            <select id="growth_repo" name="growth_repo" defaultValue={selectedGrowthRepo}>
              {trendingRepos.map((repo) => (
                <option key={repo.repoName} value={repo.repoName}>
                  {repo.repoName}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" className="btn">
            조회
          </button>
        </form>
      </section>

      {dailyGrowth.length === 0 ? (
        <section className="card">
          <p className="empty-state">아직 표시할 성장 추이 데이터가 없습니다. 스냅샷이 이틀 이상 쌓이면 증가량이 계산됩니다.</p>
        </section>
      ) : (
        <>
          <div className="growth-charts">
            <section className="card">
              <div className="card-label">일별 Star 증가량</div>
              <BarChart
                color="#facc15"
                data={dailyGrowth.map((d) => ({ label: d.eventDate.slice(5), value: d.starGrowth ?? 0 }))}
              />
            </section>
            <section className="card">
              <div className="card-label">일별 Fork 증가량</div>
              <BarChart
                color="#38bdf8"
                data={dailyGrowth.map((d) => ({ label: d.eventDate.slice(5), value: d.forkGrowth ?? 0 }))}
              />
            </section>
          </div>

          <section className="card table-card">
            <table>
              <thead>
                <tr>
                  <th>날짜</th>
                  <th>Star 누적</th>
                  <th>Star 증가</th>
                  <th>Fork 누적</th>
                  <th>Fork 증가</th>
                </tr>
              </thead>
              <tbody>
                {[...dailyGrowth].reverse().map((d) => (
                  <tr key={d.eventDate}>
                    <td>{d.eventDate}</td>
                    <td>{d.stars.toLocaleString("ko-KR")}</td>
                    <td>{d.starGrowth === null ? "-" : `+${d.starGrowth.toLocaleString("ko-KR")}`}</td>
                    <td>{d.forks.toLocaleString("ko-KR")}</td>
                    <td>{d.forkGrowth === null ? "-" : `+${d.forkGrowth.toLocaleString("ko-KR")}`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      )}

      <h2 className="section-title">리포 랭킹 Top N</h2>
      <p className="section-caption">최근 활동 데이터 기준 순위 (급상승 레포와는 다른 기준입니다)</p>
      <section className="card filter-card">
        <form className="filter-form">
          <div className="field">
            <label htmlFor="date">날짜</label>
            <select id="date" name="date" defaultValue={selectedDate}>
              {rankingDates.map((date) => (
                <option key={date} value={date}>
                  {date}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="metric">기준</label>
            <select id="metric" name="metric" defaultValue={selectedMetric}>
              {RANKING_METRICS.map((metric) => (
                <option key={metric} value={metric}>
                  {RANKING_METRIC_LABELS[metric]}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="limit">개수</label>
            <select id="limit" name="limit" defaultValue={selectedLimit}>
              {RANKING_LIMITS.map((limit) => (
                <option key={limit} value={limit}>
                  Top {limit}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" className="btn">
            조회
          </button>
        </form>
      </section>

      {rankingDates.length === 0 ? (
        <section className="card">
          <p className="empty-state">아직 표시할 랭킹 데이터가 없습니다.</p>
        </section>
      ) : (
        <section className="card table-card">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Repo</th>
                <th>Star</th>
                <th>Fork</th>
                <th>Push</th>
                <th>전체 활동</th>
              </tr>
            </thead>
            <tbody>
              {ranking.map((row, index) => (
                <tr key={row.repoName}>
                  <td>{index + 1}</td>
                  <td>{row.repoName}</td>
                  <td>{row.starCount}</td>
                  <td>{row.forkCount}</td>
                  <td>{row.pushCount}</td>
                  <td>{row.totalActivity}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </main>
  );
}
