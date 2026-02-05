// Copyright 2024-2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

import { ECLVisitor } from './generated/grammar/ECLVisitor';
import { AbstractParseTreeVisitor } from 'antlr4ts/tree/AbstractParseTreeVisitor';
import * as ECL from './generated/grammar/ECLParser';
import {
  ExpressionNode,
  NodeType,
  Range,
  ConceptReferenceNode,
  SubExpressionNode,
  CompoundExpressionNode,
  RefinedExpressionNode,
  DottedExpressionNode,
  DottedAttributeNode,
  OperatorNode,
  RefinementNode,
  AttributeNode,
  AttributeNameNode,
  AttributeValueNode,
  WildcardNode,
  FilterConstraintNode,
  HistorySupplementNode,
} from './ast';
import { ParserRuleContext } from 'antlr4ts';

export class ECLASTVisitor extends AbstractParseTreeVisitor<any> implements ECLVisitor<any> {
  protected defaultResult(): any {
    return null;
  }

  private getRange(ctx: ParserRuleContext): Range {
    const start = ctx.start;
    const stop = ctx.stop ?? start;
    return {
      start: {
        line: start.line,
        column: start.charPositionInLine,
        offset: start.startIndex,
      },
      end: {
        line: stop.line,
        column: stop.charPositionInLine + (stop.text?.length ?? 0),
        offset: stop.stopIndex + 1,
      },
    };
  }

  visitExpressionconstraint(ctx: ECL.ExpressionconstraintContext): ExpressionNode {
    const refined = ctx.refinedexpressionconstraint();
    if (refined) {
      return {
        type: NodeType.ExpressionConstraint,
        range: this.getRange(ctx),
        expression: this.visit(refined),
      };
    }

    const compound = ctx.compoundexpressionconstraint();
    if (compound) {
      return {
        type: NodeType.ExpressionConstraint,
        range: this.getRange(ctx),
        expression: this.visit(compound),
      };
    }

    const dotted = ctx.dottedexpressionconstraint();
    if (dotted) {
      return {
        type: NodeType.ExpressionConstraint,
        range: this.getRange(ctx),
        expression: this.visit(dotted),
      };
    }

    const sub = ctx.subexpressionconstraint();
    return {
      type: NodeType.ExpressionConstraint,
      range: this.getRange(ctx),
      expression: sub ? this.visit(sub) : null,
    };
  }

  visitSubexpressionconstraint(ctx: ECL.SubexpressionconstraintContext): SubExpressionNode {
    // Handle nested parenthesized expression: ( expressionconstraint )
    const nestedExpr = ctx.expressionconstraint();
    if (nestedExpr) {
      const innerExpr: ExpressionNode = this.visit(nestedExpr);

      // Extract constraint operator if present
      const constraintCtx = ctx.constraintoperator();
      const operator = constraintCtx ? this.visitConstraintoperator(constraintCtx) : undefined;

      const memberOfCtx = ctx.memberof();

      const node: SubExpressionNode = {
        type: NodeType.SubExpressionConstraint,
        range: this.getRange(ctx),
        operator,
        memberOf: memberOfCtx ? true : undefined,
        focus: innerExpr,
      };

      this.attachFiltersAndHistory(ctx, node);
      return node;
    }

    // Handle focus concept (concept reference or wildcard)
    const focusCtx = ctx.eclfocusconcept();
    const focus = focusCtx
      ? this.visit(focusCtx)
      : ({ type: NodeType.Wildcard, range: this.getRange(ctx) } as WildcardNode);

    // Extract constraint operator if present
    const constraintCtx = ctx.constraintoperator();
    const operator = constraintCtx ? this.visitConstraintoperator(constraintCtx) : undefined;

    const memberOfCtx = ctx.memberof();

    const node: SubExpressionNode = {
      type: NodeType.SubExpressionConstraint,
      range: this.getRange(ctx),
      operator,
      memberOf: memberOfCtx ? true : undefined,
      focus,
    };

    this.attachFiltersAndHistory(ctx, node);
    return node;
  }

  visitEclfocusconcept(ctx: ECL.EclfocusconceptContext): ConceptReferenceNode | WildcardNode {
    const conceptRef = ctx.eclconceptreference();
    if (conceptRef) {
      return this.visit(conceptRef);
    }

    const wildcard = ctx.wildcard();
    if (wildcard) {
      return { type: NodeType.Wildcard, range: this.getRange(ctx) } as WildcardNode;
    }

    // altidentifier — treat as wildcard for now
    return { type: NodeType.Wildcard, range: this.getRange(ctx) } as WildcardNode;
  }

  visitEclconceptreference(ctx: ECL.EclconceptreferenceContext): ConceptReferenceNode {
    const conceptId = ctx.conceptid().text;
    const termCtx = ctx.term();
    const term = termCtx ? termCtx.text : undefined;

    return {
      type: NodeType.ConceptReference,
      range: this.getRange(ctx),
      conceptId,
      term,
    };
  }

  visitConstraintoperator(ctx: ECL.ConstraintoperatorContext): OperatorNode {
    let op: OperatorNode['operator'] = '<';

    if (ctx.descendantorselfof()) op = '<<';
    else if (ctx.childof()) op = '<!';
    else if (ctx.childorselfof()) op = '<<!';
    else if (ctx.ancestorof()) op = '>';
    else if (ctx.ancestororselfof()) op = '>>';
    else if (ctx.parentof()) op = '>!';
    else if (ctx.parentorselfof()) op = '>>!';

    return {
      type: NodeType.ConstraintOperator,
      range: this.getRange(ctx),
      operator: op,
    };
  }

  // Compound expressions

  visitCompoundexpressionconstraint(ctx: ECL.CompoundexpressionconstraintContext): CompoundExpressionNode {
    const conj = ctx.conjunctionexpressionconstraint();
    if (conj) return this.visit(conj);

    const disj = ctx.disjunctionexpressionconstraint();
    if (disj) return this.visit(disj);

    const excl = ctx.exclusionexpressionconstraint();
    if (excl) return this.visit(excl);

    // Should not reach here for valid input
    return null as any;
  }

  visitConjunctionexpressionconstraint(ctx: ECL.ConjunctionexpressionconstraintContext): CompoundExpressionNode {
    const subs = ctx.subexpressionconstraint();
    const operands = subs.map((sub) => this.visit(sub) as SubExpressionNode);

    return {
      type: NodeType.CompoundExpression,
      range: this.getRange(ctx),
      operator: {
        type: NodeType.LogicalOperator,
        range: this.getRange(ctx),
        operator: 'AND',
      },
      operands,
    };
  }

  visitDisjunctionexpressionconstraint(ctx: ECL.DisjunctionexpressionconstraintContext): CompoundExpressionNode {
    const subs = ctx.subexpressionconstraint();
    const operands = subs.map((sub) => this.visit(sub) as SubExpressionNode);

    return {
      type: NodeType.CompoundExpression,
      range: this.getRange(ctx),
      operator: {
        type: NodeType.LogicalOperator,
        range: this.getRange(ctx),
        operator: 'OR',
      },
      operands,
    };
  }

  visitExclusionexpressionconstraint(ctx: ECL.ExclusionexpressionconstraintContext): CompoundExpressionNode {
    const subs = ctx.subexpressionconstraint();
    const operands = subs.map((sub) => this.visit(sub) as SubExpressionNode);

    return {
      type: NodeType.CompoundExpression,
      range: this.getRange(ctx),
      operator: {
        type: NodeType.LogicalOperator,
        range: this.getRange(ctx),
        operator: 'MINUS',
      },
      operands,
    };
  }

  // Refined expressions

  visitRefinedexpressionconstraint(ctx: ECL.RefinedexpressionconstraintContext): RefinedExpressionNode {
    const subExpr = this.visit(ctx.subexpressionconstraint()) as SubExpressionNode;
    const refinement = this.visitEclrefinement(ctx.eclrefinement());

    return {
      type: NodeType.RefinedExpression,
      range: this.getRange(ctx),
      expression: subExpr,
      refinement,
    };
  }

  visitEclrefinement(ctx: ECL.EclrefinementContext): RefinementNode {
    const attributes: AttributeNode[] = [];

    // Collect from first subrefinement
    this.collectAttributesFromSubrefinement(ctx.subrefinement(), attributes);

    // Collect from conjunction refinement set
    const conjSet = ctx.conjunctionrefinementset();
    if (conjSet) {
      const subs = conjSet.subrefinement();
      for (const sub of subs) {
        this.collectAttributesFromSubrefinement(sub, attributes);
      }
    }

    // Collect from disjunction refinement set
    const disjSet = ctx.disjunctionrefinementset();
    if (disjSet) {
      const subs = disjSet.subrefinement();
      for (const sub of subs) {
        this.collectAttributesFromSubrefinement(sub, attributes);
      }
    }

    return {
      type: NodeType.Refinement,
      range: this.getRange(ctx),
      attributes,
    };
  }

  private collectAttributesFromSubrefinement(ctx: ECL.SubrefinementContext, attributes: AttributeNode[]): void {
    // subrefinement can be: eclattributeset | eclattributegroup | ( eclrefinement )
    const attrSet = ctx.eclattributeset();
    if (attrSet) {
      this.collectAttributesFromAttributeSet(attrSet, attributes);
      return;
    }

    const attrGroup = ctx.eclattributegroup();
    if (attrGroup) {
      // Attribute group: { eclattributeset }
      const groupAttrSet = attrGroup.eclattributeset();
      this.collectAttributesFromAttributeSet(groupAttrSet, attributes);
      return;
    }

    const nestedRef = ctx.eclrefinement();
    if (nestedRef) {
      const nested = this.visitEclrefinement(nestedRef);
      attributes.push(...nested.attributes);
    }
  }

  private collectAttributesFromAttributeSet(ctx: ECL.EclattributesetContext, attributes: AttributeNode[]): void {
    // eclattributeset = subattributeset (ws conjunctionattributeset | ws disjunctionattributeset)?
    this.collectAttributeFromSubattributeset(ctx.subattributeset(), attributes);

    const conjSet = ctx.conjunctionattributeset();
    if (conjSet) {
      const subs = conjSet.subattributeset();
      for (const sub of subs) {
        this.collectAttributeFromSubattributeset(sub, attributes);
      }
    }

    const disjSet = ctx.disjunctionattributeset();
    if (disjSet) {
      const subs = disjSet.subattributeset();
      for (const sub of subs) {
        this.collectAttributeFromSubattributeset(sub, attributes);
      }
    }
  }

  private collectAttributeFromSubattributeset(ctx: ECL.SubattributesetContext, attributes: AttributeNode[]): void {
    // subattributeset = eclattribute | ( eclattributeset )
    const attr = ctx.eclattribute();
    if (attr) {
      const attrNode = this.visitEclattribute(attr);
      if (attrNode) {
        attributes.push(attrNode);
      }
      return;
    }

    const nestedSet = ctx.eclattributeset();
    if (nestedSet) {
      this.collectAttributesFromAttributeSet(nestedSet, attributes);
    }
  }

  // eslint-disable-next-line sonarjs/cognitive-complexity -- ANTLR visitor with multiple grammar rule branches
  visitEclattribute(ctx: ECL.EclattributeContext): AttributeNode | null {
    const nameCtx = ctx.eclattributename();
    const nameSubExpr = nameCtx.subexpressionconstraint();
    const nameNode = this.visit(nameSubExpr) as SubExpressionNode;

    // Build attribute name from the sub-expression's focus concept
    let attrName: AttributeNameNode;
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- defensive: visitor may return null
    if (nameNode?.focus?.type === NodeType.ConceptReference) {
      const conceptRef = nameNode.focus;
      attrName = {
        type: NodeType.AttributeName,
        range: this.getRange(nameCtx),
        conceptId: conceptRef.conceptId,
        term: conceptRef.term,
      };
    } else {
      // Wildcard or compound expression attribute name — store the expression for traversal
      attrName = {
        type: NodeType.AttributeName,
        range: this.getRange(nameCtx),
        expression: nameNode,
      };
    }

    const reversed = ctx.reverseflag() ? true : undefined;

    // Determine value
    let value: AttributeValueNode;

    const exprCompOp = ctx.expressioncomparisonoperator();
    const subExprCtx = ctx.subexpressionconstraint();
    if (exprCompOp && subExprCtx) {
      const valueExpr = this.visit(subExprCtx) as SubExpressionNode;
      value = {
        type: NodeType.AttributeValue,
        range: this.getRange(subExprCtx),
        expression: valueExpr,
      };
    } else if (ctx.numericcomparisonoperator() && ctx.numericvalue()) {
      const numVal = ctx.numericvalue();
      value = {
        type: NodeType.AttributeValue,
        range: numVal ? this.getRange(numVal) : this.getRange(ctx),
        rawValue: numVal?.text ?? '',
      };
    } else if (ctx.stringcomparisonoperator()) {
      const searchTerm = ctx.typedsearchterm() ?? ctx.typedsearchtermset();
      value = {
        type: NodeType.AttributeValue,
        range: searchTerm ? this.getRange(searchTerm) : this.getRange(ctx),
        rawValue: searchTerm ? searchTerm.text : '',
      };
    } else if (ctx.booleancomparisonoperator() && ctx.booleanvalue()) {
      const boolVal = ctx.booleanvalue();
      value = {
        type: NodeType.AttributeValue,
        range: boolVal ? this.getRange(boolVal) : this.getRange(ctx),
        rawValue: boolVal?.text ?? '',
      };
    } else {
      // Fallback for unrecognized attribute value patterns
      value = {
        type: NodeType.AttributeValue,
        range: this.getRange(ctx),
        rawValue: ctx.text,
      };
    }

    return {
      type: NodeType.Attribute,
      range: this.getRange(ctx),
      name: attrName,
      value,
      reversed,
    };
  }

  // Dotted expressions

  visitDottedexpressionconstraint(ctx: ECL.DottedexpressionconstraintContext): DottedExpressionNode {
    const source = this.visit(ctx.subexpressionconstraint()) as SubExpressionNode;
    const dottedAttrs = ctx.dottedexpressionattribute();
    const attributes: DottedAttributeNode[] = dottedAttrs.map((attr) => this.visitDottedexpressionattribute(attr));

    return {
      type: NodeType.DottedExpression,
      range: this.getRange(ctx),
      source,
      attributes,
    };
  }

  visitDottedexpressionattribute(ctx: ECL.DottedexpressionattributeContext): DottedAttributeNode {
    const nameCtx = ctx.eclattributename();
    const nameSubExpr = this.visit(nameCtx.subexpressionconstraint()) as SubExpressionNode;

    return {
      type: NodeType.DottedAttribute,
      range: this.getRange(ctx),
      attributeName: nameSubExpr,
    };
  }

  // Filter constraints and history supplement

  private attachFiltersAndHistory(ctx: ECL.SubexpressionconstraintContext, node: SubExpressionNode): void {
    const filters: FilterConstraintNode[] = [];

    const descFilters = ctx.descriptionfilterconstraint();
    for (const df of descFilters) {
      filters.push(this.visitDescriptionfilterconstraint(df));
    }

    const conceptFilters = ctx.conceptfilterconstraint();
    for (const cf of conceptFilters) {
      filters.push(this.visitConceptfilterconstraint(cf));
    }

    const memberFilters = ctx.memberfilterconstraint();
    for (const mf of memberFilters) {
      filters.push(this.visitMemberfilterconstraint(mf));
    }

    if (filters.length > 0) {
      node.filters = filters;
    }

    const histCtx = ctx.historysupplement();
    if (histCtx) {
      node.historySupplement = this.visitHistorysupplement(histCtx);
    }
  }

  visitDescriptionfilterconstraint(ctx: ECL.DescriptionfilterconstraintContext): FilterConstraintNode {
    const conceptExpressions: SubExpressionNode[] = [];
    const conceptReferences: ConceptReferenceNode[] = [];

    const filters = ctx.descriptionfilter();
    for (const f of filters) {
      this.collectConceptsFromDescriptionFilter(f, conceptExpressions, conceptReferences);
    }

    return {
      type: NodeType.FilterConstraint,
      range: this.getRange(ctx),
      filterType: 'description',
      conceptExpressions,
      conceptReferences,
    };
  }

  visitConceptfilterconstraint(ctx: ECL.ConceptfilterconstraintContext): FilterConstraintNode {
    const conceptExpressions: SubExpressionNode[] = [];
    const conceptReferences: ConceptReferenceNode[] = [];

    const filters = ctx.conceptfilter();
    for (const f of filters) {
      this.collectConceptsFromConceptFilter(f, conceptExpressions, conceptReferences);
    }

    return {
      type: NodeType.FilterConstraint,
      range: this.getRange(ctx),
      filterType: 'concept',
      conceptExpressions,
      conceptReferences,
    };
  }

  visitMemberfilterconstraint(ctx: ECL.MemberfilterconstraintContext): FilterConstraintNode {
    const conceptExpressions: SubExpressionNode[] = [];
    const conceptReferences: ConceptReferenceNode[] = [];

    const filters = ctx.memberfilter();
    for (const f of filters) {
      this.collectConceptsFromMemberFilter(f, conceptExpressions, conceptReferences);
    }

    return {
      type: NodeType.FilterConstraint,
      range: this.getRange(ctx),
      filterType: 'member',
      conceptExpressions,
      conceptReferences,
    };
  }

  visitHistorysupplement(ctx: ECL.HistorysupplementContext): HistorySupplementNode {
    let profile: HistorySupplementNode['profile'];
    const profileCtx = ctx.historyprofilesuffix();
    if (profileCtx) {
      if (profileCtx.historyminimumsuffix()) profile = 'MIN';
      else if (profileCtx.historymoderatesuffix()) profile = 'MOD';
      else if (profileCtx.historymaximumsuffix()) profile = 'MAX';
    }

    let subsetExpression: ExpressionNode | undefined;
    const subsetCtx = ctx.historysubset();
    if (subsetCtx) {
      subsetExpression = this.visit(subsetCtx.expressionconstraint());
    }

    return {
      type: NodeType.HistorySupplement,
      range: this.getRange(ctx),
      profile,
      subsetExpression,
    };
  }

  // eslint-disable-next-line sonarjs/cognitive-complexity -- ANTLR visitor traversing multiple grammar branches
  private collectConceptsFromDescriptionFilter(
    ctx: ECL.DescriptionfilterContext,
    conceptExpressions: SubExpressionNode[],
    conceptReferences: ConceptReferenceNode[],
  ): void {
    // typeFilter: typeidfilter has subexpressionconstraint | eclconceptreferenceset
    const typeFilter = ctx.typefilter();
    if (typeFilter) {
      const typeidFilter = typeFilter.typeidfilter();
      if (typeidFilter) {
        this.collectFromIdFilter(typeidFilter, conceptExpressions, conceptReferences);
      }
      // typetokenfilter has no concept references — skip
    }

    // dialectFilter: dialectidfilter has subexpressionconstraint | dialectidset
    const dialectFilter = ctx.dialectfilter();
    if (dialectFilter) {
      const dialectidFilter = dialectFilter.dialectidfilter();
      if (dialectidFilter) {
        const subExpr = dialectidFilter.subexpressionconstraint();
        if (subExpr) {
          conceptExpressions.push(this.visit(subExpr) as SubExpressionNode);
        }
        const dialectIdSet = dialectidFilter.dialectidset();
        if (dialectIdSet) {
          const refs = dialectIdSet.eclconceptreference();
          for (const ref of refs) {
            conceptReferences.push(this.visitEclconceptreference(ref));
          }
        }
      }
      // acceptabilityset on the dialectfilter
      const acceptabilitySet = dialectFilter.acceptabilityset();
      if (acceptabilitySet) {
        this.collectFromAcceptabilityset(acceptabilitySet, conceptReferences);
      }
      // dialectaliasfilter has no concept references — skip
    }

    // moduleFilter
    const moduleFilter = ctx.modulefilter();
    if (moduleFilter) {
      this.collectFromModuleFilter(moduleFilter, conceptExpressions, conceptReferences);
    }

    // termfilter, languagefilter, effectivetimefilter, activefilter, descriptionidfilter — no concept IDs
  }

  private collectConceptsFromConceptFilter(
    ctx: ECL.ConceptfilterContext,
    conceptExpressions: SubExpressionNode[],
    conceptReferences: ConceptReferenceNode[],
  ): void {
    // definitionStatusFilter: definitionstatusidfilter has subexpressionconstraint | eclconceptreferenceset
    const defStatusFilter = ctx.definitionstatusfilter();
    if (defStatusFilter) {
      const defStatusIdFilter = defStatusFilter.definitionstatusidfilter();
      if (defStatusIdFilter) {
        this.collectFromIdFilter(defStatusIdFilter, conceptExpressions, conceptReferences);
      }
      // definitionstatustokenfilter has no concept references — skip
    }

    // moduleFilter
    const moduleFilter = ctx.modulefilter();
    if (moduleFilter) {
      this.collectFromModuleFilter(moduleFilter, conceptExpressions, conceptReferences);
    }

    // effectivetimefilter, activefilter — no concept IDs
  }

  private collectConceptsFromMemberFilter(
    ctx: ECL.MemberfilterContext,
    conceptExpressions: SubExpressionNode[],
    conceptReferences: ConceptReferenceNode[],
  ): void {
    // moduleFilter
    const moduleFilter = ctx.modulefilter();
    if (moduleFilter) {
      this.collectFromModuleFilter(moduleFilter, conceptExpressions, conceptReferences);
    }

    // memberfieldfilter: expression comparison branch has subexpressionconstraint
    const memberFieldFilter = ctx.memberfieldfilter();
    if (memberFieldFilter) {
      const exprComp = memberFieldFilter.expressioncomparisonoperator();
      const subExpr = memberFieldFilter.subexpressionconstraint();
      if (exprComp && subExpr) {
        conceptExpressions.push(this.visit(subExpr) as SubExpressionNode);
      }
      // numeric, string, boolean, time comparisons — no concept IDs
    }

    // effectivetimefilter, activefilter — no concept IDs
  }

  /** Shared: modulefilter has subexpressionconstraint | eclconceptreferenceset */
  private collectFromModuleFilter(
    ctx: ECL.ModulefilterContext,
    conceptExpressions: SubExpressionNode[],
    conceptReferences: ConceptReferenceNode[],
  ): void {
    this.collectFromIdFilter(ctx, conceptExpressions, conceptReferences);
  }

  /** Shared: any filter with subexpressionconstraint() | eclconceptreferenceset() */
  private collectFromIdFilter(
    ctx: {
      subexpressionconstraint(): ECL.SubexpressionconstraintContext | undefined;
      eclconceptreferenceset(): ECL.EclconceptreferencesetContext | undefined;
    },
    conceptExpressions: SubExpressionNode[],
    conceptReferences: ConceptReferenceNode[],
  ): void {
    const subExpr = ctx.subexpressionconstraint();
    if (subExpr) {
      conceptExpressions.push(this.visit(subExpr) as SubExpressionNode);
    }
    const refSet = ctx.eclconceptreferenceset();
    if (refSet) {
      const refs = refSet.eclconceptreference();
      for (const ref of refs) {
        conceptReferences.push(this.visitEclconceptreference(ref));
      }
    }
  }

  /** Collect concept references from acceptabilityset (acceptabilityconceptreferenceset branch) */
  private collectFromAcceptabilityset(
    ctx: ECL.AcceptabilitysetContext,
    conceptReferences: ConceptReferenceNode[],
  ): void {
    const conceptRefSet = ctx.acceptabilityconceptreferenceset();
    if (conceptRefSet) {
      const refs = conceptRefSet.eclconceptreference();
      for (const ref of refs) {
        conceptReferences.push(this.visitEclconceptreference(ref));
      }
    }
    // acceptabilitytokenset has no concept references
  }
}
