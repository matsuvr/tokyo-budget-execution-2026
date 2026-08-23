import type { ExecutionMethod } from "./types.ts";

export interface InvestigationQuestion {
  code: string;
  text: string;
}

const QUESTIONS: Readonly<Record<ExecutionMethod, readonly InvestigationQuestion[]>> = Object.freeze({
  direct: Object.freeze([
    Object.freeze({ code: "direct-throughput", text: "担当職員数、処理件数、審査・決裁待ち時間に、年度内処理を妨げる滞留がなかったか。" }),
    Object.freeze({ code: "direct-process", text: "手続、決裁、情報システムに反復作業やボトルネックがなかったか。" }),
  ]),
  procurement: Object.freeze([
    Object.freeze({ code: "procurement-stage", text: "仕様確定、公告、入札、契約締結のどの段階で当初工程との差が生じたか。" }),
    Object.freeze({ code: "procurement-market", text: "応札者数、予定価格、調達単位、契約条件が実施を妨げていないか。" }),
  ]),
  construction: Object.freeze([
    Object.freeze({ code: "construction-schedule", text: "設計、用地、許認可、関係者調整、資材・人件費上昇のどこで工程差が生じたか。" }),
  ]),
  subsidy: Object.freeze([
    Object.freeze({ code: "subsidy-funnel", text: "想定対象数と申請数の差は、周知、要件、申請負担、審査処理のどこにあるか。" }),
  ]),
  "statutory-transfer": Object.freeze([]),
  unknown: Object.freeze([
    Object.freeze({ code: "identify-delivery-method", text: "まず執行方式と対象業務を特定できる公式資料がないか。" }),
  ]),
});

export function questionsForExecutionMethod(method: ExecutionMethod): readonly InvestigationQuestion[] {
  return QUESTIONS[method].map((question) => ({ ...question }));
}
