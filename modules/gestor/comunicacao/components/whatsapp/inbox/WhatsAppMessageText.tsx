import React from 'react';
import {
  parseWhatsAppText,
  type WhatsAppTextNode,
} from './whatsappTextFormatting';

interface WhatsAppMessageTextProps {
  children?: string | null;
}

const renderNodes = (nodes: WhatsAppTextNode[], keyPrefix = 'message') =>
  nodes.map((node, index) => {
    const key = `${keyPrefix}-${index}`;

    switch (node.type) {
      case 'link':
        return (
          <a
            key={key}
            href={node.href}
            target="_blank"
            rel="noopener noreferrer"
            className="break-words text-[#027eb5] underline decoration-[#027eb5] underline-offset-2 hover:text-[#006c9c]"
          >
            {node.value}
          </a>
        );
      case 'bold':
        return <strong key={key} className="font-bold">{renderNodes(node.children, key)}</strong>;
      case 'italic':
        return <em key={key}>{renderNodes(node.children, key)}</em>;
      case 'strikethrough':
        return <s key={key}>{renderNodes(node.children, key)}</s>;
      case 'monospace':
        return (
          <code
            key={key}
            className="rounded-sm bg-black/[0.06] px-0.5 font-mono text-[0.94em]"
          >
            {renderNodes(node.children, key)}
          </code>
        );
      default:
        return <React.Fragment key={key}>{node.value}</React.Fragment>;
    }
  });

const WhatsAppMessageText: React.FC<WhatsAppMessageTextProps> = ({ children }) => (
  <>{renderNodes(parseWhatsAppText(children))}</>
);

export default WhatsAppMessageText;
