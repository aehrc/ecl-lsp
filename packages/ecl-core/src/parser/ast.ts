// Copyright 2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

// AST Node Types for ECL

export interface Position {
  line: number;
  column: number;
  offset: number;
}

export interface Range {
  start: Position;
  end: Position;
}

export enum NodeType {
  ExpressionConstraint = 'ExpressionConstraint',
  SubExpressionConstraint = 'SubExpressionConstraint',
  CompoundExpression = 'CompoundExpression',
  RefinedExpression = 'RefinedExpression',
  DottedExpression = 'DottedExpression',
  DottedAttribute = 'DottedAttribute',
  ConceptReference = 'ConceptReference',
  ConstraintOperator = 'ConstraintOperator',
  LogicalOperator = 'LogicalOperator',
  Refinement = 'Refinement',
  Attribute = 'Attribute',
  AttributeName = 'AttributeName',
  AttributeValue = 'AttributeValue',
  Wildcard = 'Wildcard',
  FilterConstraint = 'FilterConstraint',
  HistorySupplement = 'HistorySupplement',
}

export interface ASTNode {
  type: NodeType;
  range: Range;
}

export interface ExpressionNode extends ASTNode {
  type: NodeType.ExpressionConstraint;
  expression: SubExpressionNode | CompoundExpressionNode | RefinedExpressionNode | DottedExpressionNode;
}

export interface SubExpressionNode extends ASTNode {
  type: NodeType.SubExpressionConstraint;
  operator?: OperatorNode;
  memberOf?: boolean;
  focus: ConceptReferenceNode | WildcardNode | ExpressionNode;
  filters?: FilterConstraintNode[];
  historySupplement?: HistorySupplementNode;
}

export interface CompoundExpressionNode extends ASTNode {
  type: NodeType.CompoundExpression;
  operator: LogicalOperatorNode;
  operands: SubExpressionNode[];
}

export interface RefinedExpressionNode extends ASTNode {
  type: NodeType.RefinedExpression;
  expression: SubExpressionNode;
  refinement: RefinementNode;
}

export interface DottedExpressionNode extends ASTNode {
  type: NodeType.DottedExpression;
  source: SubExpressionNode;
  attributes: DottedAttributeNode[];
}

export interface DottedAttributeNode extends ASTNode {
  type: NodeType.DottedAttribute;
  attributeName: SubExpressionNode;
}

export interface ConceptReferenceNode extends ASTNode {
  type: NodeType.ConceptReference;
  conceptId: string;
  term?: string;
}

export interface OperatorNode extends ASTNode {
  type: NodeType.ConstraintOperator;
  operator: '<' | '<<' | '>' | '>>' | '<!' | '<<!' | '>!' | '>>!';
}

export interface LogicalOperatorNode extends ASTNode {
  type: NodeType.LogicalOperator;
  operator: 'AND' | 'OR' | 'MINUS';
}

export interface RefinementNode extends ASTNode {
  type: NodeType.Refinement;
  attributes: AttributeNode[];
}

export interface AttributeNode extends ASTNode {
  type: NodeType.Attribute;
  name: AttributeNameNode;
  value: AttributeValueNode;
  reversed?: boolean;
}

export interface AttributeNameNode extends ASTNode {
  type: NodeType.AttributeName;
  conceptId?: string;
  term?: string;
  expression?: SubExpressionNode;
}

export interface AttributeValueNode extends ASTNode {
  type: NodeType.AttributeValue;
  expression?: SubExpressionNode;
  rawValue?: string;
}

export interface WildcardNode extends ASTNode {
  type: NodeType.Wildcard;
}

export interface FilterConstraintNode extends ASTNode {
  type: NodeType.FilterConstraint;
  filterType: 'description' | 'concept' | 'member';
  conceptExpressions: SubExpressionNode[];
  conceptReferences: ConceptReferenceNode[];
}

export interface HistorySupplementNode extends ASTNode {
  type: NodeType.HistorySupplement;
  profile?: 'MIN' | 'MOD' | 'MAX';
  subsetExpression?: ExpressionNode;
}
