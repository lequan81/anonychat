const Error = ({ title = 'Something went wrong', message = 'An unexpected error occurred.', onRetry }) => (
  <div className="flex flex-col items-center justify-center h-full text-center p-6">
    <h2 className="text-2xl font-bold text-red-500 mb-2">{title}</h2>
    <p className="text-gray-300 mb-4">{message}</p>
    {onRetry && (
      <button
        onClick={onRetry}
        className="px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600 transition"
      >
        Retry
      </button>
    )}
  </div>
);

export default Error;
