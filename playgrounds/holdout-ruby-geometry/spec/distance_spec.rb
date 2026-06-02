# frozen_string_literal: true

require_relative "../lib/distance"

RSpec.describe Geometry::Distance do
  let(:a) { [0, 0] }
  let(:b) { [3, 4] }

  describe ".euclidean" do
    it "computes the straight-line distance" do
      expect(described_class.euclidean(a, b)).to be_within(1e-9).of(5.0)
    end
  end

  describe ".manhattan" do
    it "computes the taxicab distance" do
      expect(described_class.manhattan(a, b)).to eq(7)
    end
  end

  describe ".chebyshev" do
    it "computes the largest coordinate difference" do
      expect(described_class.chebyshev(a, b)).to eq(4)
    end
  end
end
