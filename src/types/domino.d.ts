declare module '@mixmark-io/domino' {
  const domino: {
    createDocument(html: string, force?: boolean): any
  }
  export default domino
}
