# frozen_string_literal: true

require_relative "../../lib/shapes/polygon"

RSpec.describe Geometry::Shapes::Polygon do
  # A unit square at the origin.
  subject(:square) { described_class.new([[0, 0], [4, 0], [4, 4], [0, 4]]) }

  describe "#area" do
    it "computes the area via the shoelace formula" do
      expect(square.area).to eq(16.0)
    end

    it "ignores winding order" do
      reversed = described_class.new([[0, 4], [4, 4], [4, 0], [0, 0]])
      expect(reversed.area).to eq(16.0)
    end
  end

  describe "#perimeter" do
    it "sums the euclidean edge lengths" do
      expect(square.perimeter).to be_within(1e-9).of(16.0)
    end
  end

  it "rejects fewer than three vertices" do
    expect { described_class.new([[0, 0], [1, 1]]) }.to raise_error(ArgumentError)
  end
end
